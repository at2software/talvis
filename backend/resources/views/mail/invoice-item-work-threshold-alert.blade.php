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
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
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
            <h2>Feature Budget Threshold Reached</h2>
        </div>

        <p>The feature <strong>{{ $item->text }}</strong> of project <strong>{{ $project->name }}</strong> has reached the configured budget threshold of <strong>{{ $threshold }}%</strong>.</p>

        <div class="alert-info">
            <p><strong>Project:</strong> {{ $project->name }}</p>
            <p><strong>Feature:</strong> {{ $item->text }}</p>
            <p><strong>Threshold:</strong> {{ $threshold }}%</p>
            <p><strong>Current progress:</strong> {{ $percent }}% of the feature's estimated work</p>
            <div class="progress-bar-wrap">
                <div class="progress-bar-fill" style="width: {{ min($percent, 100) }}%"></div>
            </div>
        </div>

        <p>Hours booked on this feature have reached <strong>{{ $percent }}%</strong> of its estimate. Please review the remaining effort before the overrun affects other features.</p>

        <div class="footer">
            <p>This is an automated notification from your TALVIS system.</p>
            <p>You are receiving this email because you are the project manager of <strong>{{ $project->name }}</strong> or booked time on this feature.</p>
        </div>
    </div>
</body>
</html>
