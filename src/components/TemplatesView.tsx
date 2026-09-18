import React from 'react';
import { downloadCSVTemplate, downloadExcelTemplate, downloadAltTextTemplateCsv } from '../utils/fileParser';
import { FileSpreadsheet, Download, CheckCircle2, Info, AlertCircle, FileText, Globe, Tag, Sparkles } from 'lucide-react';

export const TemplatesView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Plantillas de Importación
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Descarga las plantillas preconfiguradas para estructurar tus archivos de actualización masiva para Shopify.
        </p>
      </div>

      {/* Download Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* CSV Template */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-[#6012C3] flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Plantilla SEO (.csv)</h3>
              <p className="text-xs text-slate-500 mt-1">
                Formato estándar delimitado por comas UTF-8 para Handle, Title y Meta Description.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70 text-[11px] font-mono text-slate-600">
              Product ID,URL Handle,SEO Title,Meta Description
            </div>
          </div>

          <button
            id="btn-download-template-csv"
            type="button"
            onClick={downloadCSVTemplate}
            className="w-full py-2.5 px-4 bg-[#6012C3] hover:bg-[#4b0d9c] text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar CSV SEO</span>
          </button>
        </div>

        {/* Excel Template */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">Plantilla Excel (.xlsx)</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  Recomendada
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Incluye formato nativo de celdas y hoja secundaria de instrucciones SEO.
              </p>
            </div>

            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px]">Hoja 1: <strong>Productos</strong></span>
              </div>
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px]">Hoja 2: <strong>Instrucciones</strong></span>
              </div>
            </div>
          </div>

          <button
            id="btn-download-template-excel"
            type="button"
            onClick={downloadExcelTemplate}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Excel SEO</span>
          </button>
        </div>

        {/* Alt Text Template */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">Plantilla Alt Text (.csv)</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                  Módulo AI
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Para carga o consulta de imágenes específicas mediante Product ID y Media ID.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70 text-[11px] font-mono text-slate-600">
              Product ID,Media ID,Alt Text
            </div>
          </div>

          <button
            id="btn-download-template-alt-text"
            type="button"
            onClick={downloadAltTextTemplateCsv}
            className="w-full py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar CSV Alt Text</span>
          </button>
        </div>
      </div>

      {/* Field Details & SEO Guidelines Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-2">
          <Info className="w-4 h-4 text-[#6012C3]" />
          <span>Estructura y Reglas de los Campos</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5 w-40">Columna</th>
                <th className="py-3 px-3.5 w-28">Obligatorio</th>
                <th className="py-3 px-3.5 min-w-[200px]">Reglas & Recomendaciones</th>
                <th className="py-3 px-3.5 min-w-[200px]">Si se deja en blanco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-3.5 font-mono font-bold text-slate-900 flex items-center space-x-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#6012C3]" />
                  <span>Product ID</span>
                </td>
                <td className="py-3 px-3.5">
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-semibold text-[10px]">
                    SÍ (Obligatorio)
                  </span>
                </td>
                <td className="py-3 px-3.5">
                  Debe ser el ID numérico de Shopify del producto (ej: <code className="font-mono text-slate-800">1234567890123</code>).
                </td>
                <td className="py-3 px-3.5 text-rose-600">
                  La fila es rechazada con error de validación.
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3.5 font-mono font-bold text-slate-900 flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  <span>URL Handle</span>
                </td>
                <td className="py-3 px-3.5">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium text-[10px]">
                    Opcional
                  </span>
                </td>
                <td className="py-3 px-3.5">
                  Slug para la URL del producto. Solo letras minúsculas, números y guiones. Máximo 255 caracteres.
                </td>
                <td className="py-3 px-3.5 text-emerald-700 font-medium">
                  Se conserva el handle actual en Shopify sin cambios.
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3.5 font-mono font-bold text-slate-900 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-purple-600" />
                  <span>SEO Title</span>
                </td>
                <td className="py-3 px-3.5">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium text-[10px]">
                    Opcional
                  </span>
                </td>
                <td className="py-3 px-3.5">
                  Título que Google muestra en los resultados. Recomendado entre <strong>50 y 70 caracteres</strong>.
                </td>
                <td className="py-3 px-3.5 text-emerald-700 font-medium">
                  Se conserva el SEO Title actual en Shopify sin cambios.
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3.5 font-mono font-bold text-slate-900 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  <span>Meta Description</span>
                </td>
                <td className="py-3 px-3.5">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium text-[10px]">
                    Opcional
                  </span>
                </td>
                <td className="py-3 px-3.5">
                  Texto descriptivo para buscadores. Recomendado entre <strong>120 y 160 caracteres</strong>.
                </td>
                <td className="py-3 px-3.5 text-emerald-700 font-medium">
                  Se conserva la Meta Description actual en Shopify sin cambios.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
