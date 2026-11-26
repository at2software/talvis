<?php

namespace App\Enums;

/**
 * Read as "company1 <type> company2": company1 is a customer of company2, company1 belongs to the group
 * of company2, company1 referred company2 to us. Partner and competitor are symmetric.
 */
enum ConnectionType: string {
    case Customer   = 'customer';
    case Partner    = 'partner';
    case Group      = 'group';
    case Competitor = 'competitor';
    case Referral   = 'referral';
}
