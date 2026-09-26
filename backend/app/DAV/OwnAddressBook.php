<?php

declare(strict_types=1);

namespace App\DAV;

use Sabre\CardDAV\AddressBook;

/**
 * CardDAV address book node with TALVIS-specific read-only ACLs.
 *
 * Adapted from sabre/dav's AddressBook class.
 * Portions Copyright (C) fruux GmbH (https://fruux.com/), original author
 * Evert Pot (http://evertpot.com/)
 *
 * @license http://sabre.io/license/ Modified BSD License
 */
class OwnAddressBook extends AddressBook {
    public function getChildACL() {
        return [
            [
                'privilege' => '{DAV:}read',
                'principal' => $this->getOwner(),
                'protected' => true,
            ],
        ];
    }
    public function getACL() {
        return [
            [
                'privilege' => '{DAV:}read',
                'principal' => $this->getOwner(),
                'protected' => true,
            ],
        ];
    }
}
