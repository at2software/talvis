<?php

namespace App\Http\Controllers;

use App\Http\Requests\WebhookEndpointRequest;
use App\Models\WebhookEndpoint;
use App\Services\SafeUrlGuard;

class WebhookEndpointController extends Controller {
    public function index() {
        return WebhookEndpoint::latest()->get();
    }
    public function store(WebhookEndpointRequest $request) {
        $endpoint = WebhookEndpoint::create([...$request->validated(), 'created_by_id' => $request->user()->id]);
        return $endpoint->makeVisible('secret');
    }
    public function update(WebhookEndpointRequest $request, WebhookEndpoint $webhook) {
        $webhook->update($request->validated());
        return $webhook;
    }
    public function destroy(WebhookEndpoint $webhook) {
        $webhook->delete();
        return $webhook;
    }
    public function showSecret(WebhookEndpoint $webhook) {
        return ['secret' => $webhook->secret];
    }
    public function rotateSecret(WebhookEndpoint $webhook) {
        return ['secret' => $webhook->rotateSecret()];
    }
    public function indexDeliveries(WebhookEndpoint $webhook) {
        return $webhook->deliveries()->latest('id')->limit(50)->get();
    }
    public function ping(WebhookEndpoint $webhook, SafeUrlGuard $guard) {
        $delivery = $webhook->queue('ping', ['endpoint' => $webhook->name]);
        $delivery->send($guard);
        return $delivery->refresh();
    }
}
