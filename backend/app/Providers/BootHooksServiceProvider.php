<?php

namespace App\Providers;

use App\Models\BaseModel;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\ServiceProvider;

class BootHooksServiceProvider extends ServiceProvider {
    public function register(): void {}
    public function boot(): void {
        Validator::extend('poly_exists', function ($attribute, $value, $parameters, $validator) {
            return BaseModel::fromPath($value) ? true : false;
        });
    }
}
