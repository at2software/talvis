<h2 style="color: #dc2626;">Uptime Alert: {{ $monitor->name }} is Down</h2>

<p>Your monitored service is currently unavailable:</p>

<table style="margin: 20px 0; border-collapse: collapse;">
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Monitor Name:</td>
        <td style="padding: 8px;">{{ $monitor->name }}</td>
    </tr>
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">URL:</td>
        <td style="padding: 8px;"><a href="{{ $monitor->url }}">{{ $monitor->url }}</a></td>
    </tr>
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Status:</td>
        <td style="padding: 8px; color: #dc2626; font-weight: bold;">{{ strtoupper($check->status) }}</td>
    </tr>
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Checked At:</td>
        <td style="padding: 8px;">{{ $check->checked_at->format('Y-m-d H:i:s') }}</td>
    </tr>
    @if($check->status_code)
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Status Code:</td>
        <td style="padding: 8px;">{{ $check->status_code }}</td>
    </tr>
    @endif
    @if($check->response_time)
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Response Time:</td>
        <td style="padding: 8px;">{{ $check->response_time }}ms</td>
    </tr>
    @endif
    @if($check->error_message)
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Error Message:</td>
        <td style="padding: 8px; color: #dc2626;">{{ $check->error_message }}</td>
    </tr>
    @endif
</table>

<p style="margin-top: 20px; color: #6b7280;">
    This is an automated notification from TALVIS Uptime Monitoring.<br>
    You are receiving this because you are monitoring this service.
</p>
