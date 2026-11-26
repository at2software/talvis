<?php

namespace App\Queries;

use App\Models\Company;
use App\Models\Connection;
use App\Models\Param;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CompanyNetworkQuery {
    public const MAX_SECOND_DEGREE = 40;

    /** @var array<int, int[]> */
    private array $adjacency = [];

    public function __construct(private Company $root) {}

    /**
     * @return array{connections: Collection, depth: array<int, int>, path: int[]}
     */
    public function get(): array {
        $edges = DB::table('connections')->select('company1_id', 'company2_id')->get();
        foreach ($edges as $edge) {
            $this->adjacency[(int)$edge->company1_id][] = (int)$edge->company2_id;
            $this->adjacency[(int)$edge->company2_id][] = (int)$edge->company1_id;
        }
        $meId  = (int)Param::get('ME_ID')->value;
        $first = array_values(array_unique($this->adjacency[$this->root->id] ?? []));
        $depth = [$this->root->id => 0] + array_fill_keys($first, 1);

        foreach ($this->secondDegree($first, $meId, $depth) as $id) {
            $depth[$id] = 2;
        }
        $path = $this->pathBetween($meId, $this->root->id);
        foreach ($path as $i => $id) {
            $depth[$id] ??= count($path) - 1 - $i;
        }

        $pathEdges = [];
        foreach (array_slice($path, 1) as $i => $id) {
            $pathEdges[self::edgeKey($path[$i], $id)] = true;
        }
        $ids         = array_keys($depth);
        $connections = Connection::with(['company1', 'company2'])
            ->withCount('projects')
            ->whereIn('company1_id', $ids)
            ->whereIn('company2_id', $ids)
            ->get()
            ->filter(fn ($_) => $depth[$_->company1_id] <= 1 || $depth[$_->company2_id] <= 1 || isset($pathEdges[self::edgeKey($_->company1_id, $_->company2_id)]))
            ->values();

        return ['connections' => Connection::networkPayload($connections), 'depth' => $depth, 'path' => $path];
    }

    /**
     * @param int[] $first
     * @param array<int, int> $known
     * @return int[]
     */
    private function secondDegree(array $first, int $meId, array $known): array {
        $bridges = [];
        foreach ($first as $neighbour) {
            if ($neighbour === $meId) {
                continue;
            }
            foreach (array_unique($this->adjacency[$neighbour] ?? []) as $candidate) {
                if (! isset($known[$candidate])) {
                    $bridges[$candidate] = ($bridges[$candidate] ?? 0) + 1;
                }
            }
        }
        if (! $bridges) {
            return [];
        }
        $relevance = DB::table('companies')
            ->whereIn('id', array_keys($bridges))
            ->whereNull('deleted_at')
            ->select('id', 'net', 'is_key_account')
            ->get()
            ->filter(fn ($_) => $_->is_key_account || $_->net > 0 || $bridges[$_->id] >= 2)
            ->sortByDesc(fn ($_) => [(int)$_->is_key_account, $bridges[$_->id], (float)$_->net])
            ->take(self::MAX_SECOND_DEGREE);
        return $relevance->pluck('id')->all();
    }

    /**
     * @return int[]
     */
    private function pathBetween(int $from, int $to): array {
        if ($from === $to || ! isset($this->adjacency[$from])) {
            return [];
        }
        $previous = [$from => null];
        $queue    = [$from];
        while ($queue) {
            $current = array_shift($queue);
            foreach ($this->adjacency[$current] ?? [] as $next) {
                if (array_key_exists($next, $previous)) {
                    continue;
                }
                $previous[$next] = $current;
                if ($next === $to) {
                    $path = [];
                    for ($node = $to; $node !== null; $node = $previous[$node]) {
                        $path[] = $node;
                    }
                    return array_reverse($path);
                }
                $queue[] = $next;
            }
        }
        return [];
    }

    private static function edgeKey(int $a, int $b): string {
        return min($a, $b).'-'.max($a, $b);
    }
}
