<?php

namespace App\DAV;

use Sabre\DAV;
use Sabre\DAVACL\PrincipalBackend\PDO;
use Sabre\Uri;

/**
 * Principal backend that resolves DAV principals from TALVIS users.
 *
 * Adapted from sabre/dav's PDO principal backend.
 * Portions Copyright (C) fruux GmbH (https://fruux.com/)
 *
 * @license http://sabre.io/license/ Modified BSD License
 */
class OwnPrincipalBackend extends PDO {
    /**
     * Reference to PDO connection.
     *
     * @var \PDO
     */
    protected $pdo;

    public function __construct(\PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Returns a list of principals based on a prefix.
     *
     * This prefix will often contain something like 'principals'. You are only
     * expected to return principals that are in this base path.
     *
     * You are expected to return at least a 'uri' for every user, you can
     * return any additional properties if you wish so. Common properties are:
     *   {DAV:}displayname
     *   {http://sabredav.org/ns}email-address - This is a custom SabreDAV
     *     field that's actualy injected in a number of other properties. If
     *     you have an email address, use this property.
     *
     * @param string $prefixPath
     * @return array
     */
    public function getPrincipalsByPrefix($prefixPath) {
        $fields = [
            'email',
        ];

        $result = $this->pdo->query('SELECT '.implode(',', $fields).'  FROM '.'users');

        $principals = [];

        while ($row = $result->fetch(\PDO::FETCH_ASSOC)) {
            $principal = [
                'uri' => 'principals/'.$row['email'],
            ];
            $principals[] = $principal;
        }
        return $principals;
    }

    /**
     * Returns a specific principal, specified by it's path.
     * The returned structure should be the exact same as from
     * getPrincipalsByPrefix.
     *
     * @param string $path
     * @return array
     */
    public function getPrincipalByPath($path) {
        $parts = explode('/', $path);
        $email = isset($parts[1]) ? $parts[1] : '';
        if ($email == '') {
            return [];
        }

        $fields = [
            'id',
            'email',
        ];

        $stmt = $this->pdo->prepare('SELECT '.implode(',', $fields).'  FROM '.'users'.' WHERE email = ?');
        $stmt->execute([$email]);

        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (! $row) {
            return [];
        }

        $principal = [
            'id'  => $row['id'],
            'uri' => 'principals/'.$row['email'],
        ];
        return $principal;
    }

    /**
     * Returns the list of members for a group-principal.
     *
     * @param string $principal
     * @return array
     */
    public function getGroupMemberSet($principal) {
        $result = [];
        return $result;
    }

    /**
     * Returns the list of groups a principal is a member of.
     *
     * @param string $principal
     * @return array
     */
    public function getGroupMembership($principal) {
        $result   = [];
        $result[] = $principal;
        return $result;
    }

    /**
     * Updates the list of group members for a group principal.
     *
     * The principals should be passed as a list of uri's.
     *
     * @param string $principal
     */
    public function setGroupMemberSet($principal, array $members) {}
}
