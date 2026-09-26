<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #f4f4f4;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .alert-info {
            background-color: #fde8e8;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 20px 0;
        }
        .progress-bar-wrap {
            background-color: #e9ecef;
            border-radius: 4px;
            height: 20px;
            margin: 10px 0;
            overflow: hidden;
        }
        .progress-bar-fill {
            background-color: #dc3545;
            height: 100%;
            border-radius: 4px;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Predicted Work Budget Overrun</h2>
        </div>

        <p>Based on its current pace, the project <strong>{{ $project->name }}</strong> is predicted to exceed <strong>{{ $threshold }}%</strong> of its quoted budget by the time it finishes.</p>

        <div class="alert-info">
            <p><strong>Project:</strong> {{ $project->name }}</p>
            <p><strong>Threshold:</strong> {{ $threshold }}%</p>
            <p><strong>Quoted:</strong> {{ round($project->work_estimated, 1) }}h</p>
            <p><strong>Predicted final:</strong> {{ $predictedFinal }}h ({{ $percent }}% of quote)</p>
            <div class="progress-bar-wrap">
                <div class="progress-bar-fill" style="width: {{ min($percent, 100) }}%"></div>
            </div>
        </div>

        <p>This is a model prediction based on the project's current burn rate, not yet-logged hours — please review the project timeline and budget while there's still time to act.</p>

        <div class="footer">
            <p>This is an automated notification from your TALVIS system.</p>
            <p>You are receiving this email because you are the project manager of <strong>{{ $project->name }}</strong>.</p>
        </div>
    </div>
</body>
</html>
