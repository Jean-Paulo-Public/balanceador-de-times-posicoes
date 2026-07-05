// Tipos da File System Access API (showSaveFilePicker / showOpenFilePicker).
// Ainda não fazem parte do lib.dom.d.ts padrão do TypeScript — só os tipos de
// FileSystemFileHandle/FileSystemWritableFileStream já vêm prontos, então só
// declaramos aqui o que falta, sem duplicar nada.
export {};

declare global {
  interface FilePickerAcceptTypeOption {
    description?: string;
    accept: Record<string, string[]>;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: FilePickerAcceptTypeOption[];
  }

  interface OpenFilePickerOptions {
    types?: FilePickerAcceptTypeOption[];
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
  }

  interface Window {
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  }
}
