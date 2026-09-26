import { Service } from '@angular/core';
import { CdkTable } from '@angular/cdk/table';
import { Dictionary } from '@constants/constants';

const loadExcelJs = async () => {
    const mod = await import('exceljs');
    return (mod as unknown as { default?: typeof mod }).default ?? mod;
};

@Service()
export class TableExportService {
    async exportAnyTableToCSV(table: HTMLTableElement | CdkTable<unknown>, filenamePrefix: string = '') {
        if (table instanceof HTMLTableElement) {
            await this.#exportTableAsCsv(table, filenamePrefix);
        } else if (table instanceof CdkTable) {
            this.#exportCdkTableAsCsv(table, filenamePrefix);
        }
    }

    async #exportTableAsCsv(table: HTMLTableElement, filenamePrefix: string = ''): Promise<void> {
        if (!table) {
            console.error('Table empty');
            return;
        }

        const rows = this.#convertTableToCsv(table);
        const { Workbook } = await loadExcelJs();
        const wb = new Workbook();
        const ws = wb.addWorksheet('Daten');
        ws.addRows(rows);

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const filename = this.#generateFilename(filenamePrefix);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    #convertTableToCsv(table: HTMLTableElement): (string | number)[][] {
        const rows = Array.from(table.rows);
        const conv = (cell: HTMLTableCellElement, data: string) => {
            if ('exportNumeric' in cell.dataset) return parseFloat(data);
            return data;
        };
        return rows
            .filter((row) => !('exportHidden' in row.dataset))
            .map((row) => {
                const cells = Array.from(row.cells);
                return cells
                    .filter((cell) => !('exportHidden' in cell.dataset))
                    .map((cell) => {
                        if (cell.dataset?.export) {
                            return conv(cell, cell.dataset.export);
                        }
                        return conv(cell, cell.textContent?.trim() || '');
                    });
            });
    }

    #exportCdkTableAsCsv(table: CdkTable<unknown>, filenamePrefix: string): void {
        if (!table || !table.dataSource) {
            console.error('CdkTable or dataSource empty');
            return;
        }

        const separator = ',';

        const columns = table._contentColumnDefs.map((columnDef) => columnDef.name);
        if (columns.length === 0) {
            console.error('No columns in CdkTable');
            return;
        }

        const headers = columns.join(separator);
        let csvContent = headers + '\n';

        const data = table.dataSource as Dictionary[];
        data.forEach((row) => {
            const rowData = columns.map((column) => {
                let cell = row[column] === null || row[column] === undefined ? '' : row[column];
                cell = cell instanceof Date ? cell.toLocaleString() : cell.toString();
                return cell;
            });
            csvContent += rowData.join(separator) + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const filename = this.#generateFilename(filenamePrefix);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    #generateFilename(filenamePrefix: string): string {
        const now = new Date();
        const formattedDate = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}`;
        const formattedTime = `${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;
        const dateTime = `${formattedDate}_${formattedTime}`;
        return filenamePrefix ? `${filenamePrefix}_${dateTime}` : dateTime;
    }
}
