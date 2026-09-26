<?php

namespace App\Http\Controllers;

use App\Http\Requests\Stats\QuoteAccuracyRequest;
use App\Models\User;
use App\Services\CustomerRevenueStatsService;
use App\Services\FocusStatisticsService;
use App\Services\ForecastStatisticsService;
use App\Services\Project\ProjectQuoteSignalCurveService;
use App\Services\ProjectStatisticsService;
use App\Services\RevenueStatisticsService;
use App\Services\TeamStatisticsService;
use App\Services\WorkingTimeService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class StatsController extends Controller {
    public function showRevenueCurrentYear() {
        return RevenueStatisticsService::getCurrentYearRevenue();
    }
    public function showSvB() {
        return RevenueStatisticsService::getSvBData();
    }
    public function showInvoiceOverall() {
        return RevenueStatisticsService::getInvoiceOverall();
    }
    public function showTeamStatus() {
        return TeamStatisticsService::getTeamStatus();
    }
    public function apiTeamMonitor() {
        return response()->json(TeamStatisticsService::getTeamMonitorData());
    }
    public function showMyWorkingTime() {
        return WorkingTimeService::getWorkingTimeFor(request()->user());
    }
    public function showWorkingTimeFor(User $user) {
        return WorkingTimeService::getWorkingTimeFor($user);
    }
    public function showQuoteAccuracy(QuoteAccuracyRequest $request) {
        $start = Carbon::parseFromLocale($request->validated('startDate'));
        $end   = Carbon::parseFromLocale($request->validated('endDate'));
        return ProjectStatisticsService::getQuoteAccuracy($start, $end);
    }
    public function showProjectProductMix(QuoteAccuracyRequest $request) {
        $start = Carbon::parseFromLocale($request->validated('startDate'));
        $end   = Carbon::parseFromLocale($request->validated('endDate'));
        return ProjectStatisticsService::getProductMix($start, $end);
    }
    public function showProjectSuccessRate(QuoteAccuracyRequest $request) {
        $start = Carbon::parseFromLocale($request->validated('startDate'));
        $end   = Carbon::parseFromLocale($request->validated('endDate'));
        return ProjectStatisticsService::getSuccessRate($start, $end);
    }
    public function showProjectWarrantyLoad(QuoteAccuracyRequest $request) {
        $start = Carbon::parseFromLocale($request->validated('startDate'));
        $end   = Carbon::parseFromLocale($request->validated('endDate'));
        return ProjectStatisticsService::getWarrantyLoad($start, $end);
    }
    public static function clusterFor(Carbon $start, Carbon $end): string {
        $diff = $end->diffInDays($start);
        if ($diff > 365 * 4) {
            return '%Y-01-01';
        }
        if ($diff > 30 * 4) {
            return '%Y-%m-01';
        }
        return '%Y-%m-%d';
    }
    public function showQuoteAcceptanceSignalCurve(string $signal) {
        $data = ProjectQuoteSignalCurveService::build($signal);
        if ($data === null) {
            return responseError('Not enough labeled data');
        }
        return response()->json($data);
    }
    public function showLinearRegressionForecast() {
        return ForecastStatisticsService::getLinearRegressionForecast();
    }
    public function indexFocusCategories() {
        return response()->json(FocusStatisticsService::getFocusCategories());
    }
    public function showPredictionAccuracy() {
        return response()->json(FocusStatisticsService::getPredictionAccuracy());
    }
    public function showFocusAccuracy() {
        return response()->json(FocusStatisticsService::getFocusAccuracy());
    }
    public function showCompanyPredictionAccuracy() {
        return response()->json(FocusStatisticsService::getCompanyPredictionAccuracy());
    }
    public function showCustomerRevenueScatter(Request $request) {
        $xAxis = $request->validate([
            'x_axis' => 'nullable|in:cross_sell_ratio,customer_age,lifetime_revenue,project_count,months_since_last',
        ])['x_axis'] ?? null;
        return response()->json(CustomerRevenueStatsService::getScatterData($xAxis));
    }
}
