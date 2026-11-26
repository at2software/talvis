<?php

namespace App\Builders;

use App\Traits\HasVcardBuilder;

class UserBuilder extends BaseBuilder {
    use HasVcardBuilder;

    public function whereEmployed() {
        return $this->whereHas('activeEmployments');
    }
}
