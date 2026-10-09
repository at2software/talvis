<?php

namespace App\Services;

use App\Models\MarketingActivity;
use App\Models\MarketingInitiative;
use App\Models\MarketingPerformanceMetric;
use Illuminate\Http\Request;

class MarketingMetricsService {
    public static function getPerformanceMetrics(Request $request) {
        $query = MarketingPerformanceMetric::with('relatedMetric');

        if ($request->has('metric_type')) {
            $query->byType($request->metric_type);
        }

        if ($request->has('search')) {
            $query->where('name', 'like', '%'.$request->search.'%');
        }
        return $query->latest()->get()->map(function ($metric) {
            return [
                'id'                  => $metric->id,
                'name'                => $metric->name,
                'description'         => $metric->description,
                'metric_type'         => $metric->metric_type,
                'target_value'        => $metric->target_value,
                'kpi_icon'            => $metric->kpi_icon,
                'kpi_color'           => $metric->kpi_color,
                'related_metric_id'   => $metric->related_metric_id,
                'current_value'       => $metric->getCurrentValue(),
                'progress_percentage' => round($metric->getProgressPercentage(), 2),
                'activity_stats'      => $metric->getActivityStatistics(),
                'created_at'          => $metric->created_at,
                'updated_at'          => $metric->updated_at,
            ];
        });
    }
    public static function attachMetricToInitiative(MarketingInitiative $initiative, int $metricId, ?float $targetValue): mixed {
        if ($initiative->performanceMetrics()->where('marketing_performance_metric_id', $metricId)->exists()) {
            return null;
        }

        $initiative->performanceMetrics()->attach($metricId, [
            'target_value' => $targetValue,
        ]);
        return $initiative->performanceMetrics()
            ->where('marketing_performance_metric_id', $metricId)
            ->withPivot(['target_value'])
            ->first();
    }
    public static function updateInitiativeMetric(MarketingInitiative $initiative, MarketingPerformanceMetric $metric, ?float $targetValue) {
        $initiative->performanceMetrics()->findOrFail($metric->id);
        $initiative->performanceMetrics()->updateExistingPivot($metric->id, [
            'target_value' => $targetValue,
        ]);
        return $initiative->performanceMetrics()
            ->where('marketing_performance_metric_id', $metric->id)
            ->withPivot(['target_value'])
            ->first();
    }
    public static function attachMetricToActivity(MarketingActivity $activity, int $metricId, ?float $targetValue): mixed {
        if ($activity->performanceMetrics()->where('marketing_performance_metric_id', $metricId)->exists()) {
            return null;
        }

        $activity->performanceMetrics()->attach($metricId, [
            'target_value' => $targetValue,
        ]);
        return $activity->performanceMetrics()
            ->where('marketing_performance_metric_id', $metricId)
            ->withPivot(['target_value'])
            ->first();
    }
    public static function updateActivityMetric(MarketingActivity $activity, MarketingPerformanceMetric $metric, ?float $targetValue) {
        $activity->performanceMetrics()->findOrFail($metric->id);
        $activity->performanceMetrics()->updateExistingPivot($metric->id, [
            'target_value' => $targetValue,
        ]);
        return $activity->performanceMetrics()
            ->where('marketing_performance_metric_id', $metric->id)
            ->withPivot(['target_value'])
            ->first();
    }
}
