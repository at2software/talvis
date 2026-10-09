<?php

namespace App\Enums;

enum ProjectIssueSource: int {
    case Internal = 0;
    case GitLab   = 1;
    case Mantis   = 2;
    case Jira     = 3;
    case GitHub   = 4;
}
