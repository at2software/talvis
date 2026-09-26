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
        .version-info {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
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
            <h2>Framework Major Version Update Detected</h2>
        </div>

        <p>A new major version of <strong>{{ $frameworkName }}</strong> has been released.</p>

        <div class="version-info">
            <p><strong>Previous Version:</strong> {{ $oldVersion }}</p>
            <p><strong>New Version:</strong> {{ $newVersion }}</p>
        </div>

        <p>This is a major version change and may include breaking changes. Please review the release notes and plan accordingly for updating your projects.</p>

        <div class="footer">
            <p>This is an automated notification from your TALVIS system.</p>
            <p>You are receiving this email because you subscribed to framework update notifications.</p>
        </div>
    </div>
</body>
</html>
