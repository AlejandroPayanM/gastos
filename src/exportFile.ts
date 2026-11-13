import { Platform, Share } from 'react-native';

/** Entrega un archivo CSV: hoja de compartir en iPhone/Android, descarga en navegador de escritorio. */
export async function exportCsv(filename: string, csv: string): Promise<string> {
  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
    try {
      const file = new File([csv], filename, { type: 'text/csv' });
      if (nav?.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return 'Listo: elige "Guardar en Archivos" o Excel.';
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return '';
      // si compartir falla, caemos a la descarga
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return `Descargado: ${filename}`;
  }
  await Share.share({ message: csv, title: filename });
  return '';
}
