<?php

namespace App\Http\Controllers;

use App\DAV\CapturingSapi;
use App\DAV\OwnCalDAVBackend;
use App\DAV\OwnPDOBasicAuthBackend;
use App\DAV\OwnPrincipalBackend;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Sabre\CalDAV;
use Sabre\CalDAV\ICSExportPlugin;
use Sabre\DAV;
use Sabre\DAVACL;

class CalDAVController extends Controller {
    public function handleCalDAV(Request $request): Response {
        $server = $this->startCalDAVServer($request->route()->getName());
        return CapturingSapi::toLaravelResponse($server->httpResponse);
    }

    public function startCalDAVServer(string $rootUri): DAV\Server {
        $pdo = DB::connection()->getPdo();
        $pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
        $server = $this->createCalDAVServer($pdo);

        $server->setBaseUri($rootUri);

        $authBackend = new OwnPDOBasicAuthBackend($pdo);
        $authPlugin  = new DAV\Auth\Plugin($authBackend);
        $server->addPlugin($authPlugin);
        $aclPlugin = new DAVACL\Plugin;
        $server->addPlugin($aclPlugin);

        $icsPlugin = new ICSExportPlugin;
        $server->addPlugin($icsPlugin);

        $server->start();
        return $server;
    }

    public function createCalDAVServer(\PDO $pdo): DAV\Server {
        $principalBackend = new OwnPrincipalBackend($pdo);
        $calendarBackend  = new OwnCalDAVBackend($pdo);

        $tree = [
            new DAVACL\PrincipalCollection($principalBackend),
            new CalDAV\CalendarRoot($principalBackend, $calendarBackend),
        ];

        DAV\Server::$exposeVersion = false;
        $server = new DAV\Server($tree, new CapturingSapi);

        $caldavPlugin = new CalDAV\Plugin;
        $server->addPlugin($caldavPlugin);

        $syncPlugin = new DAV\Sync\Plugin;
        $server->addPlugin($syncPlugin);

        // Browser plugin for testing, Auth and ACL need to be disabled
        // $browserPlugin = new DAV\Browser\Plugin();
        // $server->addPlugin($browserPlugin);
        return $server;
    }
}
