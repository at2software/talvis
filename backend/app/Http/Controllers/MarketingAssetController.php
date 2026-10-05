<?php

namespace App\Http\Controllers;

use App\Models\File;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MarketingAssetController extends Controller {
    public function index(Request $request) {
        $query = File::where('parent_type', 'marketing');

        $category    = $request->input('category');
        $searchQuery = $request->input('query');
        $searchTags  = $request->input('tags');

        if ($category) {
            $query->where('category', $category);
        }

        if ($searchQuery) {
            $query->where('name', 'like', '%'.$searchQuery.'%');
        }

        if ($searchTags) {
            $tags = explode(',', $searchTags);
            $query->where(function ($q) use ($tags) {
                foreach ($tags as $tag) {
                    $tag = trim($tag);
                    if ($tag) {
                        $q->orWhere('tags', 'like', '%'.$tag.'%');
                    }
                }
            });
        }

        $assets = $query->latest()->get()->map(function ($file) {
            return [
                'id'           => $file->id,
                'name'         => $file->name,
                'mime'         => $file->mime,
                'category'     => $file->category ?? 'Documents',
                'tags'         => $file->tags ? explode(',', $file->tags) : [],
                'created_at'   => $file->created_at->toISOString(),
                'file_size'    => $file->file_size,
                'dimensions'   => $file->dimensions,
                'download_url' => route('files.show', $file->id),
                'preview_url'  => $this->getPreviewUrl($file),
                'thumbnail'    => $file->thumbnail,
            ];
        });
        return response()->json($assets);
    }
    public function store(Request $request) {
        $uploadedFile = $request->file('file');

        if (! $uploadedFile) {
            return response()->json(['error' => 'No file uploaded'], 422);
        }

        $request->validate([
            'file' => 'required|file|max:20480', // 20MB max
        ]);

        $category = $request->input('category') ?: $this->categorizeFile($uploadedFile);

        $filename  = time().'_'.File::filename_safe($uploadedFile->getClientOriginalName());
        $directory = 'marketing-assets/'.Str::slug($category);
        $filepath  = $directory.'/'.$filename;

        $path = Storage::putFileAs($directory, $uploadedFile, $filename);

        $fileSize   = $uploadedFile->getSize();
        $dimensions = null;

        if (Str::startsWith($uploadedFile->getMimeType(), 'image/')) {
            $imageInfo = getimagesize($uploadedFile->getPathname());
            if ($imageInfo) {
                $dimensions = $imageInfo[0].'x'.$imageInfo[1];
            }
        }

        $file = File::create([
            'name'        => $uploadedFile->getClientOriginalName(),
            'dir'         => $filepath,
            'mime'        => $uploadedFile->getMimeType(),
            'parent_type' => 'marketing',
            'parent_id'   => null,
            'category'    => $category,
            'file_size'   => $fileSize,
            'dimensions'  => $dimensions,
            'uploaded_by' => Auth::id(),
        ]);
        return response()->json([
            'id'       => $file->id,
            'name'     => $file->name,
            'mime'     => $file->mime,
            'category' => $file->category,
            'message'  => 'Asset uploaded successfully',
        ]);
    }
    public function destroy($id) {
        $file = File::findOrFail($id);

        if (Storage::exists($file->dir)) {
            Storage::delete($file->dir);
        }

        $file->delete();
        return response()->json(['message' => 'Asset deleted successfully']);
    }
    public function updateTags($id, Request $request) {
        $file = File::findOrFail($id);

        $request->validate([
            'tags'   => 'array',
            'tags.*' => 'string|max:50',
        ]);

        $tags       = $request->input('tags', []);
        $file->tags = implode(',', $tags);
        $file->save();
        return response()->json([
            'message' => 'Tags updated successfully',
            'tags'    => $tags,
        ]);
    }
    public function updateCategory($id, Request $request) {
        $file = File::findOrFail($id);

        $request->validate(['category' => 'required|string|max:100']);

        $file->category = $request->input('category');
        $file->save();
        return response()->json([
            'message'  => 'Category updated successfully',
            'category' => $file->category,
        ]);
    }
    private function categorizeFile($file): string {
        $extension = strtolower($file->getClientOriginalExtension());
        $mimeType  = $file->getMimeType();

        if (Str::startsWith($mimeType, 'image/')) {
            if (in_array($extension, ['svg', 'ai', 'eps'])) {
                return 'Brand Assets';
            }
            return 'Social Media';
        }

        if (Str::startsWith($mimeType, 'video/')) {
            return 'Video Content';
        }

        if (in_array($extension, ['pdf', 'doc', 'docx'])) {
            return 'Documents';
        }

        if (in_array($extension, ['ppt', 'pptx'])) {
            return 'Presentations';
        }

        if (in_array($extension, ['html', 'htm'])) {
            return 'Email Templates';
        }
        return 'Documents';
    }
    private function getPreviewUrl($file): ?string {
        if (Str::startsWith($file->mime, 'image/')) {
            return route('files.show', $file->id);
        }
        return null;
    }
}
