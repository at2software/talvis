<?php

return [
    'machine_rate_limit' => (int)env('FLOW_MACHINE_RATE_LIMIT', 120),
    'claim_ttl_hours'    => (int)env('FLOW_CLAIM_TTL_HOURS', 24),
];
