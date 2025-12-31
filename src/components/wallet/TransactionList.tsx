"use client";

import * as React from "react";
import { Card } from "@/components/ui";
import { TransactionInfo, formatTimestamp, shortenAddress } from "@/lib/cardano";

export interface TransactionListProps {
  transactions: TransactionInfo[];
  walletAddress?: string;
  isLoading?: boolean;
  onTransactionClick?: (tx: TransactionInfo) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  walletAddress,
  isLoading = false,
  onTransactionClick,
}) => {
  // Debug logging - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && transactions?.length > 0) {
      console.log("[TransactionList] Count:", transactions?.length);
    }
  }, [transactions?.length]);

  const [showAll, setShowAll] = React.useState(false);
  
  // Memoize displayed transactions to avoid recalculation
  const displayedTransactions = React.useMemo(() => 
    showAll ? transactions : transactions.slice(0, 3),
    [showAll, transactions]
  );

  if (isLoading) {
    return (
      <Card padding="md">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <EmptyIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h4 className="text-gray-900 dark:text-white font-medium mb-1">
          No Transactions Yet
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your transaction history will appear here once you receive or send ADA.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {displayedTransactions.map((tx, index) => (
          <TransactionItem
            key={tx.hash || index}
            transaction={tx}
            walletAddress={walletAddress}
            onClick={() => onTransactionClick?.(tx)}
          />
        ))}
      </div>
      {transactions.length > 3 && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline"
          >
            {showAll ? "Show Less" : "View All Transactions"}
          </button>
        </div>
      )}
    </Card>
  );
};

interface TransactionItemProps {
  transaction: TransactionInfo;
  walletAddress?: string;
  onClick?: () => void;
}

// Memoized transaction item to prevent unnecessary re-renders
const TransactionItem: React.FC<TransactionItemProps> = React.memo(({
  transaction,
  onClick,
}) => {
  const { hash, blockTime, direction, amount } = transaction;

  // Default to neutral if direction not determined
  const isIncoming = direction === "incoming";
  const isOutgoing = direction === "outgoing";

  return (
    <div
      className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {/* Direction Icon */}
      <div
        className={`
          w-10 h-10 rounded-full flex items-center justify-center
          ${isIncoming ? "bg-green-100 dark:bg-green-900/30" : ""}
          ${isOutgoing ? "bg-red-100 dark:bg-red-900/30" : ""}
          ${!isIncoming && !isOutgoing ? "bg-gray-100 dark:bg-gray-800" : ""}
        `}
      >
        {isIncoming ? (
          <ArrowDownIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
        ) : isOutgoing ? (
          <ArrowUpIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
        ) : (
          <SwapIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        )}
      </div>

      {/* Transaction Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white">
            {isIncoming ? "Received" : isOutgoing ? "Sent" : "Transaction"}
          </span>
          {/* IN/OUT Badge */}
          {(isIncoming || isOutgoing) && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isIncoming
                  ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                  : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
              }`}
            >
              {isIncoming ? "IN" : "OUT"}
            </span>
          )}
        </div>
        {amount && parseFloat(String(amount)) > 0 && (
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`text-sm font-semibold ${
                isIncoming
                  ? "text-green-600 dark:text-green-400"
                  : isOutgoing
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {isIncoming ? "+" : isOutgoing ? "-" : ""}{String(amount)} ADA
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {shortenAddress(hash, 8)}
          </span>
          {blockTime && (
            <>
              <span className="text-gray-300 dark:text-gray-600">•</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(blockTime)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Chevron */}
      <ChevronRightIcon className="w-5 h-5 text-gray-400" />
    </div>
  );
});

TransactionItem.displayName = "TransactionItem";

// Icons
const EmptyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
    />
  </svg>
);

const ArrowDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 14l-7 7m0 0l-7-7m7 7V3"
    />
  </svg>
);

const ArrowUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 10l7-7m0 0l7 7m-7-7v18"
    />
  </svg>
);

const SwapIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
    />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5l7 7-7 7"
    />
  </svg>
);

TransactionList.displayName = "TransactionList";
