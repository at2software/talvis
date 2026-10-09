<?php

namespace App\Http\Controllers;

use App\Models\Param;
use App\Services\MicrosoftGraph;
use App\Services\TeamsBot;
use Illuminate\Http\Request;

class TeamsBotController extends Controller {
    public function receive(Request $request) {
        $graph = MicrosoftGraph::fromVault();
        abort_unless($graph, 404);
        abort_unless((new TeamsBot($graph))->verifyInboundToken($request->header('Authorization')), 401);

        $serviceUrl = (string)$request->input('serviceUrl');
        if (preg_match('#^https://[a-z0-9.-]+\.(trafficmanager\.net|botframework\.com)/#i', $serviceUrl)) {
            $param = Param::get(TeamsBot::SERVICE_URL_PARAM);
            if ($param->value !== $serviceUrl) {
                $param->value = $serviceUrl;
                $param->save();
            }
        }
        return response()->noContent();
    }
}
