<?php

namespace App\Http\Controllers;

use App\Enums\VacationState;
use App\Flow\ApprovalService;
use App\Flow\Models\Approval;
use App\Http\Requests\Vacation\ApproveRequest;
use App\Http\Requests\Vacation\StoreGrantRequest;
use App\Http\Requests\Vacation\StoreManualRequest;
use App\Http\Requests\Vacation\StoreSickNoteRequest;
use App\Http\Requests\Vacation\StoreVacationRequest;
use App\Mail\VacationMail;
use App\Models\Holiday;
use App\Models\User;
use App\Models\Vacation;
use App\Models\VacationGrant;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Mail;
use Storage;

class VacationController extends Controller {
    public function indexGrants(User $_) {
        return $_->vacation_grants()
            ->whereAfter(now(), 'expires_at')
            ->with('vacations', fn ($q) => $q->whereNot('state', VacationState::Sick))
            ->latest()->get();
    }
    public function indexRequests(User $_) {
        $collection = $_->vacations()->with('grant')->where('state', VacationState::Open)->get();
        return $collection;
    }
    public function indexAbsences(User $_) {
        return $_->vacations()
            ->whereIn('state', [VacationState::Approved, VacationState::Sick])
            ->select('vacations.id', 'vacations.state', 'vacations.started_at', 'vacations.ended_at', 'vacations.comment')
            ->orderBy('vacations.started_at')
            ->get();
    }
    public function indexSickNotes() {
        return Vacation::where('state', VacationState::Sick)
            ->whereNull('approved_at')
            ->with(['user' => fn ($q) => $q->without('activeEmployment')])
            ->get()
            ->each(fn ($v) => $v->user?->makeHidden('is_retired'));
    }
    public function indexPendingRequests() {
        return Vacation::where('state', VacationState::Open)->with('user', 'grant')->get();
    }
    private function _indexHolidays($year) {
        $filePath = "holidays/$year.json";
        $data     = Storage::get($filePath);
        if (! $data) {
            $data = file_get_contents("https://feiertage-api.de/api/?jahr=$year");
            Storage::put($filePath, $data);
        }
        // TODO: Hardcoded "BY" should be removed!
        $data     = json_decode($data);
        $response = [];
        foreach ($data->BY as $name => $_) {
            $_->name    = $name;
            $response[] = $_;
        }
        return $response;
    }
    public function indexHolidays($workZip = null) {
        $year     = intval(date('Y'));
        $holidays = [...$this->_indexHolidays($year - 1), ...$this->_indexHolidays($year), ...$this->_indexHolidays($year + 1)];

        if ($workZip) {
            $holidays = array_filter($holidays, fn ($holiday) => Holiday::isValidForZip($holiday, $workZip));
        }
        return array_values($holidays);
    }
    public function indexVacationStats(User $_) {
        return $_->vacation_grants()->with('vacations')->get();
    }
    public function destroy(Vacation $vacation) {
        if ($vacation->grant->user_id != request()->user()->id && $vacation->state !== VacationState::Open) {
            abort(400, 'cannot delete already approved requests');
        }
        $vacation->delete();
        return response()->noContent();
    }
    public function showGrant(VacationGrant $grant) {
        return $grant->load('vacations');
    }
    public function destroyGrant(VacationGrant $grant) {
        if ($grant->vacations()->where('state', VacationState::Approved)->exists()) {
            abort(400, 'cannot delete grant with approved vacations');
        }
        $sickNotes = $grant->vacations()->where('state', VacationState::Sick);
        if ($sickNotes->exists()) {
            $latestGrant = VacationGrant::where('user_id', $grant->user_id)
                ->where('id', '!=', $grant->id)
                ->latest()
                ->first();
            if (! $latestGrant) {
                abort(400, 'cannot delete: sick notes exist but no other grant to reassign them to');
            }
            $sickNotes->update(['vacation_grant_id' => $latestGrant->id]);
        }
        $grant->delete();
        return response()->noContent();
    }
    public function show(Vacation $vacation) {
        return $vacation->load('user', 'grant', 'approved_by');
    }
    public function revoke(Vacation $vacation) {
        $isOwner = $vacation->grant->user_id === request()->user()->id;
        $isHR    = request()->user()->hasAnyRole(['admin', 'hr']);
        abort_if(! $isOwner && ! $isHR, 403);
        abort_if($vacation->state !== VacationState::Open && $vacation->state !== VacationState::Approved, 422, 'Only open or approved vacation requests can be revoked.');
        abort_if(Carbon::parse($vacation->started_at)->startOfDay()->lte(today()), 422, 'Cannot revoke past vacations.');
        $vacation->update(['state' => VacationState::Cancelled]);
        return $vacation;
    }
    public function approve(ApproveRequest $request, Vacation $vacation, ApprovalService $approvals) {
        $data  = $this->getBody();
        $state = VacationState::from((int)$data->state);
        DB::transaction(function () use ($approvals, $vacation, $state, $data, $request) {
            if ($state !== VacationState::Cancelled) {
                $approval = Approval::pendingFor($vacation) ?? $approvals->request($vacation, 'hr', null);
                $state === VacationState::Approved
                    ? $approvals->approve($approval, $request->user(), @$data->reason)
                    : $approvals->reject($approval, $request->user(), @$data->reason);
            }
            $vacation->state          = $data->state;
            $vacation->approved_by_id = $request->user()->id;
            $vacation->approved_at    = now();
            $vacation->save();
        });
        try {
            Mail::to($vacation->user->email)->send(new VacationMail($vacation, $vacation->state, @$data->reason, request()->user()));
        } catch (\Throwable $e) {
            report($e);
        }
        return $vacation;
    }
    public function acknowledge(Vacation $_) {
        $_->update([
            'approved_by_id' => request()->user()->id,
            'approved_at'    => now(),
        ]);
        $_->save();
        return $_;
    }
    public function store(StoreVacationRequest $request) {
        $payload            = $request->validated();
        $payload['comment'] ??= '';
        return Vacation::create($payload);
    }
    public function storeSickNote(StoreSickNoteRequest $request) {
        $userId = $request->validated('user_id') ?? $request->user()->id;

        if ($userId != request()->user()->id && ! request()->user()->hasAnyRole(['admin', 'hr'])) {
            abort(403, 'not permitted');
        }

        $grant = VacationGrant::where('user_id', $userId)->where('expires_at', '>', now())->latest()->first();
        if ($grant) {
            $v = Vacation::create([
                'amount'            => 0,
                'state'             => VacationState::Sick,
                'started_at'        => request('started_at'),
                'ended_at'          => request('ended_at'),
                'comment'           => request('comment'),
                'vacation_grant_id' => $grant->id,
            ]);
            return $v;
        } else {
            abort(404, 'no grant found');
        }
    }
    public function storeGrant(StoreGrantRequest $request) {
        return VacationGrant::create($request->validated());
    }
    public function storeManual(StoreManualRequest $request) {
        $payload          = (new Vacation)->getValidFields(request()->all());
        $payload['state'] = VacationState::Approved;
        $v                = Vacation::create($payload);
        return $v->fresh();
    }
}
