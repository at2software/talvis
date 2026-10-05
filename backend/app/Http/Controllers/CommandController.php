<?php

namespace App\Http\Controllers;

use Illuminate\Console\Command;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use ReflectionClass;
use Symfony\Component\Console\Output\BufferedOutput;

class CommandController extends Controller {
    public function index() {
        $scheduleMap = $this->buildScheduleMap();

        $commands = collect(Artisan::all())
            ->filter(fn ($command) => $this->isCustomCommand($command))
            ->map(function ($command, $name) use ($scheduleMap) {
                $reflection = new ReflectionClass($command);
                $namespace  = $reflection->getName();

                $category = str_contains($namespace, 'Commands\\Cronjobs\\') ? 'Cronjobs' : 'General';
                if ($category === 'General') {
                    if (Str::contains($name, ['vacation', 'user'])) {
                        $category = 'HR';
                    } elseif (Str::contains($name, ['company', 'customer'])) {
                        $category = 'Customers';
                    } elseif (Str::contains($name, ['invoice', 'financial'])) {
                        $category = 'Finance';
                    }
                }
                return [
                    'name'        => $name,
                    'description' => $command->getDescription() ?: 'No description available',
                    'category'    => $category,
                    'class'       => $namespace,
                    'schedule'    => $scheduleMap[$name] ?? null,
                ];
            })
            ->groupBy('category')
            ->sortKeys();
        return response()->json($commands);
    }
    private function buildScheduleMap(): array {
        $frequencyMap = [
            '* * * * *'    => 'every minute',
            '*/5 * * * *'  => 'every 5 min',
            '*/10 * * * *' => 'every 10 min',
            '0 * * * *'    => 'hourly',
            '0 0 * * *'    => 'daily',
            '0 0 * * 0'    => 'weekly',
            '0 0 1 * *'    => 'monthly',
        ];

        $map = [];
        foreach (app(Schedule::class)->events() as $event) {
            if (preg_match('/artisan\s+([^\s{]+)/', $event->command, $matches)) {
                $map[$matches[1]] = $frequencyMap[$event->expression] ?? $event->expression;
            }
        }
        return $map;
    }
    public function execute(Request $request) {
        $data = $this->getBody();

        Log::info('Command execution request:', (array)$data);

        $commandName = $data->command ?? null;
        $arguments   = (array)($data->arguments ?? []);

        if (! $commandName) {
            return response()->json(['error' => 'The command field is required.'], 422);
        }

        if (! $this->isCommandAllowed($commandName)) {
            return response()->json(['error' => 'Command not allowed'], 403);
        }

        try {
            $output = new BufferedOutput;

            $exitCode = Artisan::call($commandName, $arguments, $output);

            $commandOutput = $output->fetch();
            return response()->json([
                'success'     => $exitCode === Command::SUCCESS,
                'exit_code'   => $exitCode,
                'output'      => $commandOutput,
                'command'     => $commandName,
                'arguments'   => $arguments,
                'executed_at' => now(),
                'executed_by' => Auth::user()->name ?? 'Unknown',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success'   => false,
                'error'     => $e->getMessage(),
                'command'   => $commandName,
                'arguments' => $arguments,
            ], 500);
        }
    }
    public function show(Request $request, string $commandName) {
        if (! $this->isCommandAllowed($commandName)) {
            return response()->json(['error' => 'Command not allowed'], 403);
        }

        try {
            $command = Artisan::all()[$commandName] ?? null;
            if (! $command) {
                return response()->json(['error' => 'Command not found'], 404);
            }
            $definition = $command->getDefinition();

            $arguments = collect($definition->getArguments())->map(function ($argument) {
                return [
                    'name'        => $argument->getName(),
                    'description' => $argument->getDescription(),
                    'required'    => $argument->isRequired(),
                    'is_array'    => $argument->isArray(),
                    'default'     => $argument->getDefault(),
                ];
            });

            $options = collect($definition->getOptions())->map(function ($option) {
                return [
                    'name'           => $option->getName(),
                    'description'    => $option->getDescription(),
                    'shortcut'       => $option->getShortcut(),
                    'value_required' => $option->isValueRequired(),
                    'is_array'       => $option->isArray(),
                    'default'        => $option->getDefault(),
                ];
            });
            return response()->json([
                'name'        => $commandName,
                'description' => $command->getDescription(),
                'help'        => $command->getProcessedHelp(),
                'arguments'   => $arguments,
                'options'     => $options,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 404);
        }
    }
    private function isCommandAllowed(string $commandName): bool {
        $command = Artisan::all()[$commandName] ?? null;
        return $command && $this->isCustomCommand($command);
    }
    private function isCustomCommand(object $command): bool {
        return str_starts_with((new ReflectionClass($command))->getName(), 'App\\Console\\Commands\\');
    }
}
