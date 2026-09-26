<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Project;
use App\Models\ProjectState;
use Illuminate\Http\Request;

class TalvisController extends Controller {
    public function attention(Request $request) {
        $fnStr = function ($fs, $o) {
            return is_callable($fs) ? $fs($o) : $fs;
        };
        $fnMerge = function (&$array, $with, $title = '', $label = '') use ($fnStr) {
            $with = $with
                ->get()
                ->append('class')
                ->append('icon')
                ->each(function ($item) use ($fnStr, $title, $label) {
                    $item->attentionLabel = $fnStr($label, $item);
                    $item->attentionTitle = $fnStr($title, $item);
                })
                ->toArray();
            $array = array_merge($array, $with);
        };

        $return = [];
        $fnMerge($return, Invoice::where('due_at', '<', now())->where('paid_at', null),
            function ($x) {
                return $x->name;
            },
            'Overdue invoice'
        );
        $fnMerge($return, Project::where('due_at', '<', now())->whereState('progress', ProjectState::Running),
            function ($x) {
                return $x->name;
            },
            'Deadline overdue'
        );
        return $return;
    }
    public function icon() {
        $d  = file_get_contents(resource_path('icons/synapse.png'));
        $im = imagecreatefromstring($d);
        imagepng($im);
        $photo        = ob_get_clean();
        $browserCache = 60 * 60 * 24 * 7;
        return response($photo)
            ->header('Content-type', 'image/png')
            ->header('Cache-Control', 'private, max-age='.$browserCache)
            ->header('Expires', gmdate('D, d M Y H:i:s', time() + $browserCache).' GMT')
            ->header('Content-Length', strlen($photo))
            ->header('Last-Modified', gmdate('D, d M Y H:i:s', filemtime(resource_path('icons/synapse.png'))).' GMT')
            ->header('ETag', hash('sha256', $photo));
    }
    public function populateClipboard(Request $request) {
        $data     = (array)$this->getBody();
        $response = [];
        foreach ($data as $class => $ids) {
            $response[$class] = [];
            foreach ($ids as $id) {
                $model = app('App\\Models\\'.$class);
                if ($obj = $model::find($id)) {
                    if ($obj->canBeAccessedByUser()) {
                        $response[$class][] = $obj;
                    }
                }
            }
        }
        return $response;
    }

    /**
     * @throws \Exception
     */
    public static function dieDebugBacktrace($title = 'backtrace') {
        try {
            throw new \Exception("<$title>");
        } catch (\Exception $e) {
            report($e);
            exit();
        }
    }
}
