<?php

namespace App\Http\Controllers;

use App\Models\PluginLink;
use App\Models\Project;
use Illuminate\Http\Request;

class PluginLinkController extends Controller {
    public function store(Request $request) {
        return (new PluginLink)->applyAndSave($request);
    }
    public function storeForProject(Project $_) {
        $data                = (array)$this->getBody();
        $data['parent_id']   = $_->id;
        $data['parent_type'] = Project::class;
        return PluginLink::create($data);
    }
    public function createPluginLinkWithChannel(Project $project) {
        request()->validate(['type' => 'required|string', 'url' => 'required|string']);
        $data = (array)$this->getBody();

        $chatController = PluginController::getByKey($data['type'], PluginChatController::class);

        if ($chatController) {
            try {
                $id = $chatController->getOrCreateChannel($project, '', '', 'Chat');
                $data['url'] .= $id;
                $chatController->addUsersToChannel($id, ...$project->assigned_users);

                $data['parent_id']   = $project->id;
                $data['parent_type'] = Project::class;
                return PluginLink::create($data);
            } catch (\Exception $e) {
            }
        }
        return [];
    }
    public function destroy(PluginLink $plugin_link) {
        $plugin_link->delete();
        return $plugin_link;
    }
    public function update(Request $request, PluginLink $plugin_link) {
        return $plugin_link->applyAndSave($request);
    }
}
