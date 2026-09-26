<?php

namespace App\Helpers;

/**
 * TALVIS Log Helper - Enhanced logging with calling context
 *
 * Usage:
 * NLog::info('User logged in', ['user_id' => 123]);
 * NLog::error('Database connection failed');
 *
 * Output format: [timestamp] <ClassName.methodName:[line]>.LEVEL: message
 */
class NLog extends LogHelper {
}
