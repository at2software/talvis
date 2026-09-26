<?php

namespace App\Http\Controllers;

use App\DAV\CapturingSapi;
use App\DAV\OwnAddressBookRoot;
use App\DAV\OwnCardDAVBackend;
use App\DAV\OwnPDOBasicAuthBackend;
use App\DAV\OwnPrincipalBackend;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Sabre\CardDAV;
use Sabre\DAV;
use Sabre\DAVACL;

class CardDAVController extends Controller {
    public function handleCardDAV(Request $request): Response {
        $server = $this->startCardDAVServer($request->route()->getName());
        return CapturingSapi::toLaravelResponse($server->httpResponse);
    }

    public function startCardDAVServer(string $rootUri): DAV\Server {
        $pdo = DB::connection()->getPdo();
        $pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
        $server = $this->createCardDAVServer($pdo);
        $server->setBaseUri($rootUri);
        $authBackend = new OwnPDOBasicAuthBackend($pdo);
        $authPlugin  = new DAV\Auth\Plugin($authBackend);
        $server->addPlugin($authPlugin);
        $aclPlugin = new DAVACL\Plugin;
        $server->addPlugin($aclPlugin);
        $server->start();
        return $server;
    }

    public function createCardDAVServer(\PDO $pdo): DAV\Server {
        $principalBackend   = new OwnPrincipalBackend($pdo);
        $addressBookBackend = new OwnCardDAVBackend($pdo);
        $tree = [
            new DAVACL\PrincipalCollection($principalBackend),
            new OwnAddressBookRoot($principalBackend, $addressBookBackend),
        ];
        DAV\Server::$exposeVersion = false;
        $server = new DAV\Server($tree, new CapturingSapi);
        $carddavPlugin = new CardDAV\Plugin;
        $server->addPlugin($carddavPlugin);
        $syncPlugin = new DAV\Sync\Plugin;
        $server->addPlugin($syncPlugin);

        // Browser plugin (optional, for debugging)
        // $browserPlugin = new DAV\Browser\Plugin();
        // $server->addPlugin($browserPlugin);
        return $server;
    }
}
