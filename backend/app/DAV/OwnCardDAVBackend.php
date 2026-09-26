<?php

namespace App\DAV;

use App\Models\User;
use Sabre\CardDAV;
use Sabre\CardDAV\Backend\PDO;

/**
 * CardDAV backend that exposes TALVIS contacts as a read-only address book
 * per user.
 *
 * Adapted from sabre/dav's PDO CardDAV backend.
 * Portions Copyright (C) fruux GmbH (https://fruux.com/)
 *
 * @license http://sabre.io/license/ Modified BSD License
 */
class OwnCardDAVBackend extends PDO {
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
     * Returns the list of addressbooks for a specific user.
     *
     * @param string $principalUri
     * @return array
     */
    public function getAddressBooksForUser($principalUri) {
        $parts = explode('/', $principalUri);
        $email = isset($parts[1]) ? $parts[1] : '';
        if ($email == '') {
            return [];
        }

        $principals = [];
        $stmt       = $this->pdo->prepare('SELECT id, email FROM '.'users'.' WHERE email = ?');
        $stmt->execute([$email]);

        $addressBooks = [];

        foreach ($stmt->fetchAll() as $row) {
            $addressBooks[] = [
                'id'                                                      => $row['id'],
                'uri'                                                     => 'default',
                'principaluri'                                            => 'principals/'.$row['email'],
                '{DAV:}displayname'                                       => 'Default Addressbook',
                '{'.CardDAV\Plugin::NS_CARDDAV.'}addressbook-description' => null,
                '{http://calendarserver.org/ns/}getctag'                  => null,
                '{http://sabredav.org/ns}sync-token'                      => '0',
                '{http://sabredav.org/ns}read-only'                       => 1,
                'share-access'                                            => 2,
                'read-only'                                               => true,
            ];
        }
        return $addressBooks;
    }

    /**
     * Returns all cards for a specific addressbook id.
     *
     * This method should return the following properties for each card:
     *   * carddata - raw vcard data
     *   * uri - Some unique url
     *   * lastmodified - A unix timestamp
     *
     * It's recommended to also return the following properties:
     *   * etag - A unique etag. This must change every time the card changes.
     *   * size - The size of the card in bytes.
     *
     * If these last two properties are provided, less time will be spent
     * calculating them. If they are specified, you can also ommit carddata.
     * This may speed up certain requests, especially with large cards.
     *
     * @param mixed $addressbookId
     * @return array
     */
    public function getCards($addressbookId) {
        // $stmt = $this->pdo->prepare('SELECT '.'id, email, username'.'  FROM '.'users'.' WHERE id = ?');
        // $stmt->execute([$addressbookId]);

        // $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        // if (!$row) {
        //     return [];
        // }
        // $user = $row->firstOrFail();
        $user   = User::findOrFail($addressbookId);
        $result = $user->getAddressBook();
        return $result;
    }

    /**
     * Returns a specific card.
     *
     * The same set of properties must be returned as with getCards. The only
     * exception is that 'carddata' is absolutely required.
     *
     * If the card does not exist, you must return false.
     *
     * @param mixed $addressBookId
     * @param string $cardUri
     * @return array
     */
    public function getCard($addressBookId, $cardUri) {
        $cards = $this->getCards($addressBookId);
        $card  = array_filter($cards, function ($card) use ($cardUri) {
            return $card['uri'] == $cardUri;
        });
        $card = reset($card);
        return $card;
    }

    /**
     * Returns a list of cards.
     *
     * This method should work identical to getCard, but instead return all the
     * cards in the list as an array.
     *
     * If the backend supports this, it may allow for some speed-ups.
     *
     * @param mixed $addressBookId
     * @return array
     */
    public function getMultipleCards($addressBookId, array $uris) {
        $all_cards = $this->getCards($addressBookId);
        $cards     = array_filter($all_cards, function ($card) use ($uris) {
            return in_array($card['uri'], $uris);
        });
        return $cards;
    }
}
