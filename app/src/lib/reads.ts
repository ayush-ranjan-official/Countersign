import { useQuery } from "@tanstack/react-query";
import { decodeAbiParameters, encodeFunctionData, erc20Abi, parseAbi, parseAbiItem, type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { DEPLOYMENT, FUSD, FUSD_DENOM, PQC_KEY_STATUS, REST, csAbi, faucetAbi } from "./config";
import type { Terms } from "./terms";

const keyStatusAbi = parseAbi(["function pqcKeyStatus(address) view returns (bool, uint8, bytes, bool)"]);

export interface KeyStatus {
  active: boolean;
  registered: boolean;
  algorithmId: number;
  keyLength: number;
  possessionProven: boolean;
}

/** The ML-DSA-87 key status Countersign itself reads (pqcKeyStatus precompile, same fail-closed length check). */
export function useKeyStatus(addr: Address | undefined) {
  const pub = usePublicClient();
  return useQuery({
    queryKey: ["keyStatus", addr],
    enabled: !!addr && !!pub,
    refetchInterval: 15_000,
    queryFn: async (): Promise<KeyStatus> => {
      const res = await pub!.call({ to: PQC_KEY_STATUS, data: encodeFunctionData({ abi: keyStatusAbi, functionName: "pqcKeyStatus", args: [addr!] }) });
      const raw = res.data ?? "0x";
      if ((raw.length - 2) / 2 < 160) return { active: false, registered: false, algorithmId: 0, keyLength: 0, possessionProven: false };
      const [registered, algorithmId, pubkey, possessionProven] = decodeAbiParameters(
        [{ type: "bool" }, { type: "uint8" }, { type: "bytes" }, { type: "bool" }],
        raw,
      );
      return { active: true, registered, algorithmId, keyLength: (pubkey.length - 2) / 2, possessionProven };
    },
  });
}

export const STATUS = ["None", "Open", "Settled", "Reclaimed"] as const;
export interface Trade {
  terms: Terms;
  status: number;
  sellerAffirmed: boolean;
  buyerAffirmed: boolean;
  officerApproved: boolean;
  assetLocked: boolean;
  cashLocked: boolean;
}

export function tradeQueryOptions(pub: ReturnType<typeof usePublicClient>, id: Hex | undefined) {
  return {
    queryKey: ["trade", id],
    enabled: !!id && !!pub,
    refetchInterval: 8_000,
    queryFn: async () => (await pub!.readContract({ address: DEPLOYMENT.countersign, abi: csAbi, functionName: "getTrade", args: [id!] })) as Trade,
  };
}

export function useTrade(id: Hex | undefined) {
  return useQuery(tradeQueryOptions(usePublicClient(), id));
}

export function useNav() {
  const pub = usePublicClient();
  return useQuery({
    queryKey: ["nav"],
    enabled: !!pub,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [price, timestamp] = (await pub!.readContract({ address: DEPLOYMENT.countersign, abi: csAbi, functionName: "latestNav", args: [DEPLOYMENT.bond, FUSD] })) as [bigint, bigint];
      return { price, timestamp };
    },
  });
}

/** Chain time (latest block timestamp), which is what deadlines and NAV age are measured against. */
export function useChainNow() {
  const pub = usePublicClient();
  return useQuery({
    queryKey: ["now"],
    enabled: !!pub,
    refetchInterval: 10_000,
    queryFn: async () => (await pub!.getBlock()).timestamp,
  });
}

export function useBalances(addr: Address | undefined) {
  const pub = usePublicClient();
  return useQuery({
    queryKey: ["balances", addr],
    enabled: !!addr && !!pub,
    refetchInterval: 10_000,
    queryFn: async () => {
      const bal = (token: Address) => pub!.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [addr!] });
      const allow = (token: Address) => pub!.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [addr!, DEPLOYMENT.countersign] });
      const [qor, fusd, bonds, fusdAllowance, bondAllowance, nextClaim] = await Promise.all([
        pub!.getBalance({ address: addr! }),
        bal(FUSD),
        bal(DEPLOYMENT.bond),
        allow(FUSD),
        allow(DEPLOYMENT.bond),
        pub!.readContract({ address: DEPLOYMENT.faucet, abi: faucetAbi, functionName: "nextClaimAt", args: [addr!] }) as Promise<bigint>,
      ]);
      return { qor, fusd, bonds, fusdAllowance, bondAllowance, nextClaim };
    },
  });
}

/** Bank-form fUSD (what the faucet pays) over REST. Null when no REST proxy is available on this host. */
export function useBankFusd(qor1: string | undefined) {
  return useQuery({
    queryKey: ["bankFusd", qor1],
    enabled: !!qor1,
    refetchInterval: 15_000,
    retry: false,
    queryFn: async (): Promise<bigint | null> => {
      try {
        const res = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${qor1}/by_denom?denom=${encodeURIComponent(FUSD_DENOM)}`);
        if (!res.ok) return null;
        const body = (await res.json()) as { balance?: { amount?: string } };
        return BigInt(body.balance?.amount ?? "0");
      } catch {
        return null;
      }
    },
  });
}

// ---------------------------------------------------------------- blotter: every TradeOpened, scanned in chunks

const tradeOpened = parseAbiItem(
  "event TradeOpened(bytes32 indexed tradeId, address indexed seller, address indexed buyer, (address seller, address buyer, address asset, uint256 assetAmount, address cash, uint256 cashAmount, uint64 deadline, bytes32 ticketHash, uint256 salt) terms)",
);
const CHUNK = 9_999n; // the public RPC allows at most 10,000 blocks per eth_getLogs
const PARALLEL = 6;

export interface OpenedTrade {
  id: Hex;
  terms: Terms;
  block: string;
  tx: Hex;
}
interface Cache {
  scannedTo: string;
  trades: OpenedTrade[];
}
const cacheKey = `countersign:blotter:${DEPLOYMENT.countersign.toLowerCase()}`;
const loadCache = (): Cache => {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) return JSON.parse(raw, (k, v) => (["assetAmount", "cashAmount", "deadline", "salt"].includes(k) ? BigInt(v) : v)) as Cache;
  } catch {
    /* private mode or corrupt cache: rescan */
  }
  return { scannedTo: (DEPLOYMENT.deployBlock - 1n).toString(), trades: [] };
};
const saveCache = (c: Cache) => {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(c, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch {
    /* ignore */
  }
};

export function useBlotter() {
  const pub = usePublicClient();
  return useQuery({
    queryKey: ["blotter"],
    enabled: !!pub,
    refetchInterval: 20_000,
    queryFn: async (): Promise<OpenedTrade[]> => {
      const cache = loadCache();
      const latest = await pub!.getBlockNumber();
      let from = BigInt(cache.scannedTo) + 1n;
      while (from <= latest) {
        const ranges: [bigint, bigint][] = [];
        for (let i = 0; i < PARALLEL && from <= latest; i++) {
          const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
          ranges.push([from, to]);
          from = to + 1n;
        }
        const logs = (await Promise.all(ranges.map(([f, t]) => pub!.getLogs({ address: DEPLOYMENT.countersign, event: tradeOpened, fromBlock: f, toBlock: t })))).flat();
        for (const l of logs) {
          if (!l.args.tradeId || !l.args.terms) continue;
          if (cache.trades.some((x) => x.id === l.args.tradeId)) continue;
          cache.trades.push({ id: l.args.tradeId, terms: l.args.terms as Terms, block: l.blockNumber.toString(), tx: l.transactionHash });
        }
        cache.scannedTo = ranges[ranges.length - 1]![1].toString();
        saveCache(cache);
      }
      return [...cache.trades].sort((a, b) => Number(BigInt(b.block) - BigInt(a.block)));
    },
  });
}

const settledEvent = parseAbiItem("event Settled(bytes32 indexed tradeId, address indexed seller, address indexed buyer, uint256 assetAmount, uint256 cashAmount)");

/** The settlement receipt: the Settled event of a trade, searched forward from the block it was opened in. */
export function useSettlement(id: Hex | undefined, openedBlock: string | undefined, settled: boolean) {
  const pub = usePublicClient();
  return useQuery({
    queryKey: ["settled", id],
    enabled: !!id && !!openedBlock && settled && !!pub,
    staleTime: Infinity,
    queryFn: async () => {
      const latest = await pub!.getBlockNumber();
      for (let from = BigInt(openedBlock!); from <= latest; from += CHUNK + 1n) {
        const to = from + CHUNK > latest ? latest : from + CHUNK;
        const logs = await pub!.getLogs({ address: DEPLOYMENT.countersign, event: settledEvent, args: { tradeId: id! }, fromBlock: from, toBlock: to });
        if (logs[0]) return { tx: logs[0].transactionHash, block: logs[0].blockNumber };
      }
      return null;
    },
  });
}
