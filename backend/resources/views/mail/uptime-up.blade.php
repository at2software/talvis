<h2 style="color: #16a34a;">Service Recovered: {{ $monitor->name }} is Back Online</h2>

<p>Your monitored service has recovered and is now available:</p>

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
        <td style="padding: 8px; color: #16a34a; font-weight: bold;">UP</td>
    </tr>
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Recovered At:</td>
        <td style="padding: 8px;">{{ $check->checked_at->format('Y-m-d H:i:s') }}</td>
    </tr>
    @if($check->response_time)
    <tr>
        <td style="padding: 8px; font-weight: bold; background: #f3f4f6;">Response Time:</td>
        <td style="padding: 8px;">{{ $check->response_time }}ms</td>
    </tr>
    @endif
</table>

<p style="margin-top: 20px; color: #6b7280;">
    This is an automated notification from TALVIS Uptime Monitoring.<br>
    You are receiving this because you are monitoring this service.
</p>
