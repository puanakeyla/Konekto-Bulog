<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Gudang;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use SimpleXMLElement;

/**
 * CRUD master gudang (Admin). Gudang A/B/C/D adalah DATA, bukan akun user -- lihat
 * migration create_gudang_table untuk latar belakang koreksi ini.
 */
class GudangController extends Controller
{
    public function __construct(private AuditLogService $auditLog)
    {
    }

    public function index()
    {
        return response()->json(['data' => Gudang::orderBy('nama')->get()]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'kode' => ['required', 'string', 'max:30', 'unique:gudang,kode'],
            'nama' => ['required', 'string', 'max:150'],
            'aktif' => ['sometimes', 'boolean'],
        ]);

        $gudang = Gudang::create($validated);

        $this->auditLog->log($request->user(), 'buat_gudang', null, $gudang->only(['id', 'kode', 'nama']));

        return response()->json(['data' => $gudang], 201);
    }

    public function import(Request $request)
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx', 'max:2048'],
        ]);

        $rows = $this->readImportRows(
            $validated['file']->getRealPath(),
            $validated['file']->getClientOriginalExtension(),
        );
        $created = 0;
        $updated = 0;
        $errors = [];
        $seen = [];

        foreach ($rows as $row) {
            $kode = Str::upper($this->importValue($row['data'], ['kode', 'code', 'kode_gudang', 'kode gudang']));
            $nama = $this->importValue($row['data'], ['nama', 'nama_gudang', 'nama gudang', 'gudang']);
            $aktif = $this->importValue($row['data'], ['aktif', 'status']);

            if ($kode === '') {
                $errors[] = ['baris' => $row['line'], 'pesan' => 'Kode gudang wajib diisi.'];
                continue;
            }

            if ($nama === '') {
                $errors[] = ['baris' => $row['line'], 'pesan' => 'Nama gudang wajib diisi.'];
                continue;
            }

            if (strlen($kode) > 30) {
                $errors[] = ['baris' => $row['line'], 'pesan' => 'Kode gudang maksimal 30 karakter.'];
                continue;
            }

            if (strlen($nama) > 150) {
                $errors[] = ['baris' => $row['line'], 'pesan' => 'Nama gudang maksimal 150 karakter.'];
                continue;
            }

            if (isset($seen[$kode])) {
                $errors[] = ['baris' => $row['line'], 'pesan' => "Kode {$kode} duplikat di file import."];
                continue;
            }
            $seen[$kode] = true;

            $payload = [
                'kode' => $kode,
                'nama' => $nama,
                'aktif' => $aktif === '' ? true : $this->parseAktif($aktif),
            ];

            $gudang = Gudang::where('kode', $kode)->first();
            if ($gudang) {
                $gudang->update($payload);
                $updated++;
            } else {
                Gudang::create($payload);
                $created++;
            }
        }

        $this->auditLog->log($request->user(), 'import_gudang', null, [
            'created' => $created,
            'updated' => $updated,
            'errors' => count($errors),
        ]);

        return response()->json([
            'data' => [
                'created' => $created,
                'updated' => $updated,
                'errors' => $errors,
            ],
        ]);
    }

    public function update(Request $request, Gudang $gudang)
    {
        $validated = $request->validate([
            'kode' => ['sometimes', 'string', 'max:30', Rule::unique('gudang', 'kode')->ignore($gudang->id)],
            'nama' => ['sometimes', 'string', 'max:150'],
            'aktif' => ['sometimes', 'boolean'],
        ]);

        $before = $gudang->only(['kode', 'nama', 'aktif']);
        $gudang->fill($validated)->save();

        $this->auditLog->log($request->user(), 'ubah_gudang', null, [
            'id' => $gudang->id,
            'before' => $before,
            'after' => $gudang->only(['kode', 'nama', 'aktif']),
        ]);

        return response()->json(['data' => $gudang]);
    }

    /**
     * Gudang yang sudah dipakai TIDAK dihapus -- baris pengolahan lama akan kehilangan
     * identitas gudangnya dan rekap jadi bolong tanpa jejak. Admin diarahkan menonaktifkan,
     * yang menyembunyikannya dari dropdown tanpa merusak data lama.
     */
    public function destroy(Request $request, Gudang $gudang)
    {
        if ($gudang->sudahDipakai()) {
            abort(422, 'Gudang ini sudah dipakai pada data pengolahan. Nonaktifkan saja agar data lama tetap utuh.');
        }

        $detail = $gudang->only(['id', 'kode', 'nama']);
        $gudang->delete();

        $this->auditLog->log($request->user(), 'hapus_gudang', null, $detail);

        return response()->json(['message' => 'Gudang dihapus.']);
    }

    private function parseAktif(string $value): bool
    {
        $normalized = Str::lower(trim($value));

        return in_array($normalized, ['1', 'true', 'ya', 'yes', 'aktif', 'active'], true);
    }

    private function readImportRows(string $path, string $extension): array
    {
        return Str::lower($extension) === 'xlsx'
            ? $this->readXlsxRows($path)
            : $this->readCsvRows($path);
    }

    private function readCsvRows(string $path): array
    {
        $handle = fopen($path, 'r');
        if (! $handle) {
            abort(422, 'File CSV tidak dapat dibaca.');
        }

        $firstLine = fgets($handle);
        if ($firstLine === false) {
            fclose($handle);
            abort(422, 'File CSV kosong.');
        }

        $delimiter = substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',';
        rewind($handle);

        $headers = fgetcsv($handle, 0, $delimiter);
        if (! $headers) {
            fclose($handle);
            abort(422, 'Header CSV tidak valid.');
        }

        $headers = array_map(fn ($header) => $this->normalizeImportHeader((string) $header), $headers);
        $rows = [];
        $line = 1;

        while (($values = fgetcsv($handle, 0, $delimiter)) !== false) {
            $line++;
            if (count(array_filter($values, fn ($value) => trim((string) $value) !== '')) === 0) {
                continue;
            }

            $data = [];
            foreach ($headers as $index => $header) {
                if ($header === '') {
                    continue;
                }
                $data[$header] = trim((string) ($values[$index] ?? ''));
            }

            $rows[] = ['line' => $line, 'data' => $data];
        }

        fclose($handle);

        if ($rows === []) {
            abort(422, 'CSV tidak berisi data gudang.');
        }

        return $rows;
    }

    private function readXlsxRows(string $path): array
    {
        $entries = $this->readZipEntries($path);
        $sheetPath = $this->firstWorksheetPath($entries);
        $sheetXml = $entries[$sheetPath] ?? null;
        if ($sheetXml === null) {
            abort(422, 'Sheet Excel tidak ditemukan.');
        }

        $sharedStrings = $this->readSharedStrings($entries);
        $sheet = simplexml_load_string($sheetXml);
        if (! $sheet instanceof SimpleXMLElement) {
            abort(422, 'Sheet Excel tidak valid.');
        }

        $matrix = [];
        foreach ($sheet->sheetData->row as $row) {
            $rowNumber = (int) ($row['r'] ?? 0);
            $cells = [];

            foreach ($row->c as $cell) {
                $reference = (string) ($cell['r'] ?? '');
                $column = $reference !== '' ? $this->excelColumnIndex($reference) : count($cells);
                $cells[$column] = $this->excelCellValue($cell, $sharedStrings);
            }

            if (count(array_filter($cells, fn ($value) => trim((string) $value) !== '')) === 0) {
                continue;
            }

            ksort($cells);
            $matrix[$rowNumber ?: count($matrix) + 1] = $cells;
        }

        if ($matrix === []) {
            abort(422, 'File Excel kosong.');
        }

        $headerLine = array_key_first($matrix);
        $headers = array_map(fn ($header) => $this->normalizeImportHeader((string) $header), $matrix[$headerLine]);
        if (count(array_filter($headers, fn ($header) => $header !== '')) === 0) {
            abort(422, 'Header Excel tidak valid.');
        }

        $rows = [];
        foreach ($matrix as $line => $values) {
            if ($line === $headerLine) {
                continue;
            }

            $data = [];
            foreach ($headers as $index => $header) {
                if ($header === '') {
                    continue;
                }
                $data[$header] = trim((string) ($values[$index] ?? ''));
            }

            $rows[] = ['line' => $line, 'data' => $data];
        }

        if ($rows === []) {
            abort(422, 'Excel tidak berisi data gudang.');
        }

        return $rows;
    }

    private function firstWorksheetPath(array $entries): string
    {
        $workbookXml = $entries['xl/workbook.xml'] ?? null;
        $relsXml = $entries['xl/_rels/workbook.xml.rels'] ?? null;
        if ($workbookXml === null || $relsXml === null) {
            abort(422, 'Workbook Excel tidak valid.');
        }

        $workbook = simplexml_load_string($workbookXml);
        $rels = simplexml_load_string($relsXml);
        if (! $workbook instanceof SimpleXMLElement || ! $rels instanceof SimpleXMLElement) {
            abort(422, 'Workbook Excel tidak valid.');
        }

        $namespaces = $workbook->getNamespaces(true);
        $relationshipNamespace = $namespaces['r'] ?? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
        $firstSheet = $workbook->sheets->sheet[0] ?? null;
        $relationshipId = $firstSheet?->attributes($relationshipNamespace)['id'] ?? null;
        if ($relationshipId === null) {
            abort(422, 'Sheet Excel tidak ditemukan.');
        }

        foreach ($rels->Relationship as $relationship) {
            if ((string) $relationship['Id'] === (string) $relationshipId) {
                $target = ltrim((string) $relationship['Target'], '/');

                return Str::startsWith($target, 'xl/') ? $target : 'xl/'.$target;
            }
        }

        abort(422, 'Sheet Excel tidak ditemukan.');
    }

    private function readSharedStrings(array $entries): array
    {
        $xml = $entries['xl/sharedStrings.xml'] ?? null;
        if ($xml === null) {
            return [];
        }

        $sharedStrings = simplexml_load_string($xml);
        if (! $sharedStrings instanceof SimpleXMLElement) {
            return [];
        }

        $values = [];
        foreach ($sharedStrings->si as $stringItem) {
            $parts = [];
            if (isset($stringItem->t)) {
                $parts[] = (string) $stringItem->t;
            }
            foreach ($stringItem->r as $richText) {
                $parts[] = (string) $richText->t;
            }
            $values[] = implode('', $parts);
        }

        return $values;
    }

    private function readZipEntries(string $path): array
    {
        $contents = file_get_contents($path);
        if ($contents === false) {
            abort(422, 'File Excel tidak dapat dibaca.');
        }

        $eocdOffset = strrpos($contents, "PK\x05\x06");
        if ($eocdOffset === false) {
            abort(422, 'File Excel tidak valid.');
        }

        $eocd = unpack('vdisk/vcentralDisk/ventriesDisk/ventries/VcentralSize/VcentralOffset/vcommentLength', substr($contents, $eocdOffset + 4, 18));
        if (! $eocd) {
            abort(422, 'File Excel tidak valid.');
        }

        $entries = [];
        $offset = (int) $eocd['centralOffset'];
        $end = $offset + (int) $eocd['centralSize'];

        while ($offset < $end && substr($contents, $offset, 4) === "PK\x01\x02") {
            $header = unpack(
                'vversionMade/vversionNeeded/vflags/vmethod/vmodTime/vmodDate/Vcrc/VcompressedSize/VuncompressedSize/vnameLength/vextraLength/vcommentLength/vdiskStart/vinternalAttrs/VexternalAttrs/VlocalOffset',
                substr($contents, $offset + 4, 42)
            );
            if (! $header) {
                abort(422, 'File Excel tidak valid.');
            }

            $nameLength = (int) $header['nameLength'];
            $extraLength = (int) $header['extraLength'];
            $commentLength = (int) $header['commentLength'];
            $name = substr($contents, $offset + 46, $nameLength);
            $localOffset = (int) $header['localOffset'];

            if (substr($contents, $localOffset, 4) !== "PK\x03\x04") {
                abort(422, 'File Excel tidak valid.');
            }

            $local = unpack('vversion/vflags/vmethod/vmodTime/vmodDate/Vcrc/VcompressedSize/VuncompressedSize/vnameLength/vextraLength', substr($contents, $localOffset + 4, 26));
            if (! $local) {
                abort(422, 'File Excel tidak valid.');
            }

            $dataOffset = $localOffset + 30 + (int) $local['nameLength'] + (int) $local['extraLength'];
            $data = substr($contents, $dataOffset, (int) $header['compressedSize']);
            $method = (int) $header['method'];

            if ($method === 8) {
                $data = gzinflate($data);
                if ($data === false) {
                    abort(422, 'File Excel tidak dapat diekstrak.');
                }
            } elseif ($method !== 0) {
                abort(422, 'Kompresi Excel tidak didukung.');
            }

            $entries[str_replace('\\', '/', $name)] = $data;
            $offset += 46 + $nameLength + $extraLength + $commentLength;
        }

        return $entries;
    }

    private function excelCellValue(SimpleXMLElement $cell, array $sharedStrings): string
    {
        $type = (string) ($cell['t'] ?? '');

        if ($type === 's') {
            return $sharedStrings[(int) $cell->v] ?? '';
        }

        if ($type === 'inlineStr') {
            return (string) ($cell->is->t ?? '');
        }

        return (string) ($cell->v ?? '');
    }

    private function excelColumnIndex(string $reference): int
    {
        preg_match('/^[A-Z]+/i', $reference, $matches);
        $letters = Str::upper($matches[0] ?? 'A');
        $index = 0;

        foreach (str_split($letters) as $letter) {
            $index = ($index * 26) + (ord($letter) - 64);
        }

        return $index - 1;
    }

    private function importValue(array $row, array $keys): string
    {
        foreach ($keys as $key) {
            $normalized = $this->normalizeImportHeader($key);
            if (array_key_exists($normalized, $row)) {
                return trim((string) $row[$normalized]);
            }
        }

        return '';
    }

    private function normalizeImportHeader(string $header): string
    {
        $header = preg_replace('/^\xEF\xBB\xBF/', '', $header) ?? $header;
        $header = Str::lower(trim($header));

        return str_replace(['-', '_'], ' ', $header);
    }
}
