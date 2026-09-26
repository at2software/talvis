<?php

namespace App\Http\Controllers;

use App\Helpers\NLog;
use App\Models\Company;
use App\Models\CompanyContact;
use App\Models\Contact;
use App\Models\Invoice;
use App\Models\LeadSource;
use App\Models\MarketingProspect;
use App\Models\Product;
use App\Models\ProductGroup;
use App\Models\Project;
use App\Models\User;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class SearchController extends Controller {
    public static function search(Request $request) {
        try {
            $collection = collect();
            $input      = json_decode($request->getContent());

            $only    = ! empty($input->only) ? explode(',', $input->only) : null;
            $allowed = fn ($class) => (! $only || in_array($class, $only));

            if (empty($input->query)) {
                return response()->make(null, 400);
            }

            $allowed('Company') && $collection        = $collection->merge(Company::select()->whereNotDraft()->whereLike('vcard', $input->query)->get());
            $allowed('User') && $collection           = $collection->merge(User::select()->whereLike('vcard', $input->query)->get());
            $allowed('CompanyContact') && $collection = $collection->merge(CompanyContact::select()->whereLike('vcard', $input->query)->with('company', 'contact')->get());

            if ($allowed('Contact')) {
                $contactIds = Contact::select('id')->whereLike('vcard', $input->query)->pluck('id');
                $collection = $collection->merge(
                    CompanyContact::select()->whereIn('contact_id', $contactIds)->whereHas('company')->with('company', 'contact')->get()
                );
            }
            $allowed('Company') && $collection           = $collection->merge(Project::select()->whereLike('name', $input->query)->wherePreparedOrRunning()->get());
            $allowed('ProductGroup') && $collection      = $collection->merge(self::GetProductGroups($input->query));
            $allowed('Product') && $collection           = $collection->merge(Product::select()->whereLike('name', $input->query)->with('invoiceItems')->get());
            $allowed('Invoice') && $collection           = $collection->merge(Invoice::select()->whereLike('name', $input->query)->get());
            $allowed('LeadSource') && $collection        = $collection->merge(LeadSource::select()->whereLike('name', $input->query)->get());
            $allowed('MarketingProspect') && $collection = $collection->merge(MarketingProspect::select()->whereLike('vcard', $input->query)->get());

            $collection = $collection->reject(fn ($m) => $m instanceof CompanyContact && $m->company?->isDraft());
            $collection = self::keepPreferredEmployment($collection);
            $collection = $collection->unique('path');
            $collection = $collection->sortByDesc('updated_at');
            return $collection;
        } catch (Exception $ex) {
            NLog::error($ex);
            return $ex;
        }
    }
    private static function keepPreferredEmployment(Collection $collection): Collection {
        [$employments, $rest] = $collection->partition(fn ($_) => $_ instanceof CompanyContact);
        return $rest->merge(
            $employments->sortBy(fn ($_) => [$_->is_retired ? 1 : 0, -$_->id])->unique('contact_id')
        );
    }
    protected static function GetProductGroups($query): Collection {
        $products = collect();
        if ($group = ProductGroup::whereRaw('UPPER(symbol) LIKE "%'.strtoupper($query).'%"')->with('products', 'products.invoiceItems')->first()) {
            foreach ($group->products as $_) {
                $_->name = "[$group->symbol] ".$_->name;
                $_->load('invoiceItems');
                $products->push($_);
            }
        }
        return $products;
    }
}
