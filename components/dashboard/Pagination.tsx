interface PaginationProps {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-4 py-2 rounded-lg bg-[#161b27] border border-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors flex items-center gap-1"
      >
        <span className="material-icons text-sm">chevron_left</span>
        Anterior
      </button>

      <span className="text-gray-400 font-medium">
        Página <span className="text-white">{page}</span> de{' '}
        <span className="text-white">{pages}</span>
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pages}
        className="px-4 py-2 rounded-lg bg-[#161b27] border border-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors flex items-center gap-1"
      >
        Próxima
        <span className="material-icons text-sm">chevron_right</span>
      </button>
    </div>
  );
}
