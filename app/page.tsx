"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

type ArchiveDisposition = "undecided" | "discarded" | "resold";

type ClothingItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  season: string;
  notes: string;
  image: string;
  price: number | null;
  wearCount: number;
  lastWornAt: number | null;
  archived: boolean;
  archiveDisposition: ArchiveDisposition;
  resalePrice: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type Outfit = {
  id: string;
  name: string;
  season: OutfitSeason;
  occasion: string;
  notes: string;
  itemIds: string[];
  createdAt: number;
  updatedAt: number;
};

type AppState = {
  items: ClothingItem[];
  outfits: Outfit[];
};

type View = "wardrobe" | "outfits";
type WardrobeSort =
  | "updated"
  | "unworn"
  | "most-worn"
  | "cost-high"
  | "final-cost-high";
type ItemEditorState = ClothingItem | "new" | null;
type OutfitEditorState =
  | { outfit?: Outfit; seedItemIds?: string[] }
  | null;

const CATEGORIES = [
  "上衣",
  "下装",
  "外套",
  "连衣裙",
  "鞋履",
  "袜子",
  "包袋",
  "配饰",
  "其他",
];
const SEASONS = ["四季", "春夏", "秋冬", "春", "夏", "秋", "冬"];
const OUTFIT_SEASONS = ["春", "夏", "秋", "冬"] as const;
type OutfitSeason = (typeof OUTFIT_SEASONS)[number];
const SEASON_DETAILS: Record<
  OutfitSeason,
  { english: string; note: string; mark: string }
> = {
  春: { english: "SPRING", note: "轻盈叠穿", mark: "芽" },
  夏: { english: "SUMMER", note: "清爽留白", mark: "风" },
  秋: { english: "AUTUMN", note: "温暖层次", mark: "叶" },
  冬: { english: "WINTER", note: "厚实包裹", mark: "雪" },
};
const OCCASIONS = ["日常", "通勤", "约会", "旅行", "运动", "正式", "其他"];
const EMPTY_STATE: AppState = { items: [], outfits: [] };
const DB_NAME = "yiji-wardrobe";
const DB_VERSION = 1;
const STORE_NAME = "wardrobe";
const STATE_KEY = "current-state";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LONG_UNWORN_DAYS = 90;
const ARCHIVE_DETAILS: Record<
  ArchiveDisposition,
  { label: string; description: string }
> = {
  undecided: { label: "待处理", description: "暂时移出衣橱，之后再决定去向" },
  discarded: { label: "已报废", description: "已经丢弃、损坏或不再使用" },
  resold: { label: "已出二手", description: "已经出售，并记录实际成交价" },
};

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadState() {
  const database = await openDatabase();
  return new Promise<AppState>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => resolve(request.result ?? EMPTY_STATE);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function saveState(state: AppState) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function resizeImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法读取这张图片"));
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("无法处理这张图片"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function averageWearCost(item: ClothingItem) {
  if (item.price === null || item.wearCount <= 0) return null;
  return item.price / item.wearCount;
}

function finalUsageCost(item: ClothingItem) {
  if (!item.archived || item.price === null || item.archiveDisposition === "undecided") {
    return null;
  }
  if (item.archiveDisposition === "resold") {
    if (item.resalePrice === null) return null;
    return item.price - item.resalePrice;
  }
  return item.price;
}

function finalCostPerWear(item: ClothingItem) {
  const finalCost = finalUsageCost(item);
  if (finalCost === null || item.wearCount <= 0) return null;
  return finalCost / item.wearCount;
}

function archiveLabel(item: ClothingItem) {
  return ARCHIVE_DETAILS[item.archiveDisposition].label;
}

function daysSince(timestamp: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / DAY_IN_MS));
}

function lastWornLabel(item: ClothingItem) {
  if (!item.lastWornAt) return "未记录穿着";
  const days = daysSince(item.lastWornAt);
  if (days === 0) return "今天穿过";
  if (days === 1) return "昨天穿过";
  return `${days} 天前穿过`;
}

function isUsageAttentionNeeded(item: ClothingItem) {
  return !item.lastWornAt || daysSince(item.lastWornAt) >= LONG_UNWORN_DAYS;
}

function dateInputValue(timestamp: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TODAY_INPUT_VALUE = dateInputValue(new Date().getTime());

function timestampFromDateInput(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

function normalizeItem(item: ClothingItem): ClothingItem {
  const legacyItem = item as ClothingItem & {
    price?: unknown;
    wearCount?: unknown;
    lastWornAt?: unknown;
    archiveDisposition?: unknown;
    resalePrice?: unknown;
    archivedAt?: unknown;
  };
  const archiveDisposition = ["undecided", "discarded", "resold"].includes(
    String(legacyItem.archiveDisposition),
  )
    ? (legacyItem.archiveDisposition as ArchiveDisposition)
    : "undecided";
  return {
    ...item,
    price:
      typeof legacyItem.price === "number" && Number.isFinite(legacyItem.price)
        ? Math.max(0, legacyItem.price)
        : null,
    wearCount:
      typeof legacyItem.wearCount === "number" && Number.isFinite(legacyItem.wearCount)
        ? Math.max(0, Math.floor(legacyItem.wearCount))
        : 0,
    lastWornAt:
      typeof legacyItem.lastWornAt === "number" &&
      Number.isFinite(legacyItem.lastWornAt)
        ? legacyItem.lastWornAt
        : null,
    archiveDisposition,
    resalePrice:
      typeof legacyItem.resalePrice === "number" &&
      Number.isFinite(legacyItem.resalePrice)
        ? Math.max(0, legacyItem.resalePrice)
        : null,
    archivedAt:
      typeof legacyItem.archivedAt === "number" && Number.isFinite(legacyItem.archivedAt)
        ? legacyItem.archivedAt
        : item.archived
          ? item.updatedAt
          : null,
  };
}

function currentOutfitSeason(): OutfitSeason {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

function isOutfitSeason(value: string | undefined): value is OutfitSeason {
  return OUTFIT_SEASONS.includes(value as OutfitSeason);
}

function inferOutfitSeason(itemIds: string[], items: ClothingItem[]): OutfitSeason {
  const scores = new Map<OutfitSeason, number>(
    OUTFIT_SEASONS.map((season) => [season, 0]),
  );

  itemIds.forEach((id) => {
    const garmentSeason = items.find((item) => item.id === id)?.season ?? "";
    OUTFIT_SEASONS.forEach((season) => {
      if (garmentSeason.includes(season)) {
        scores.set(season, (scores.get(season) ?? 0) + 1);
      }
    });
  });

  const highest = Math.max(...scores.values());
  if (highest === 0) return currentOutfitSeason();
  return (
    OUTFIT_SEASONS.find((season) => scores.get(season) === highest) ??
    currentOutfitSeason()
  );
}

function categoryMark(category: string) {
  return category.slice(0, 1) || "衣";
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-button" type="button" onClick={onClick} aria-label="关闭">
      ×
    </button>
  );
}

function GarmentVisual({
  item,
  className = "",
}: {
  item: ClothingItem;
  className?: string;
}) {
  if (item.image) {
    return (
      // Uploaded photos are local data URLs, so Next Image cannot optimize them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={`garment-image ${className}`}
        src={item.image}
        alt={item.name}
      />
    );
  }

  return (
    <div className={`garment-placeholder tone-${item.id.charCodeAt(0) % 5} ${className}`}>
      <span>{categoryMark(item.category)}</span>
      <small>{item.category}</small>
    </div>
  );
}

function OutfitCollage({
  outfit,
  items,
  compact = false,
}: {
  outfit: Outfit;
  items: ClothingItem[];
  compact?: boolean;
}) {
  const selected = outfit.itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is ClothingItem => Boolean(item))
    .slice(0, 4);

  return (
    <div className={`outfit-collage count-${selected.length} ${compact ? "compact" : ""}`}>
      {selected.map((item) => (
        <div className="collage-tile" key={item.id}>
          <GarmentVisual item={item} />
        </div>
      ))}
      {selected.length === 0 && (
        <div className="collage-empty">
          <span>搭</span>
          <small>等待选择单品</small>
        </div>
      )}
      {outfit.itemIds.length > 4 && (
        <span className="collage-more">+{outfit.itemIds.length - 4}</span>
      )}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="modal-title">{title}</h2>
          </div>
          <CloseButton onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}

function ItemEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: ClothingItem | null;
  onClose: () => void;
  onSave: (item: ClothingItem) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [color, setColor] = useState(initial?.color ?? "");
  const [season, setSeason] = useState(initial?.season ?? SEASONS[0]);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [image, setImage] = useState(initial?.image ?? "");
  const [price, setPrice] = useState(
    initial?.price === null || initial?.price === undefined ? "" : String(initial.price),
  );
  const [wearCount, setWearCount] = useState(String(initial?.wearCount ?? 0));
  const [lastWornDate, setLastWornDate] = useState(
    dateInputValue(initial?.lastWornAt ?? null),
  );
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择一张图片");
      return;
    }
    setError("");
    setImageBusy(true);
    try {
      setImage(await resizeImage(file));
    } catch {
      setError("这张图片暂时无法使用，请换一张试试");
    } finally {
      setImageBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("给这件衣服起个名字吧");
      return;
    }
    const parsedPrice = price.trim() ? Number(price) : null;
    const parsedWearCount = Number(wearCount || 0);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError("价格需要是大于或等于 0 的数字");
      return;
    }
    if (!Number.isFinite(parsedWearCount) || parsedWearCount < 0) {
      setError("穿着次数需要是大于或等于 0 的整数");
      return;
    }
    const now = Date.now();
    onSave({
      id: initial?.id ?? makeId(),
      name: name.trim(),
      category,
      color: color.trim(),
      season,
      notes: notes.trim(),
      image,
      price: parsedPrice,
      wearCount: Math.floor(parsedWearCount),
      lastWornAt: timestampFromDateInput(lastWornDate),
      archived: initial?.archived ?? false,
      archiveDisposition: initial?.archiveDisposition ?? "undecided",
      resalePrice: initial?.resalePrice ?? null,
      archivedAt: initial?.archivedAt ?? null,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <Modal
      eyebrow={initial ? "更新单品" : "录入衣橱"}
      title={initial ? "编辑这件衣服" : "添加一件衣服"}
      onClose={onClose}
    >
      <form className="editor-form" onSubmit={submit}>
        <button
          className={`photo-dropzone ${image ? "has-image" : ""}`}
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          {image ? (
            // This is a local preview before the image is stored in IndexedDB.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="单品预览" />
          ) : (
            <>
              <span className="photo-plus">＋</span>
              <strong>{imageBusy ? "正在处理…" : "上传单品照片"}</strong>
              <small>建议使用纯色背景，搭配封面会更清楚</small>
            </>
          )}
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={onFileChange}
        />
        {image && (
          <div className="photo-actions">
            <button type="button" className="text-button" onClick={() => fileInput.current?.click()}>
              更换照片
            </button>
            <button type="button" className="text-button quiet" onClick={() => setImage("")}>
              移除
            </button>
          </div>
        )}

        <label className="field full">
          <span>单品名称 *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：燕麦色针织开衫"
            autoFocus
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>分类</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>颜色</span>
            <input
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder="燕麦色"
            />
          </label>
        </div>

        <label className="field full">
          <span>适合季节</span>
          <select value={season} onChange={(event) => setSeason(event.target.value)}>
            {SEASONS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <div className="field-row usage-field-row">
          <label className="field">
            <span>购买价格（元）</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="例如：599"
            />
          </label>
          <label className="field">
            <span>累计穿着次数</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={wearCount}
              onChange={(event) => setWearCount(event.target.value)}
            />
          </label>
          <label className="field">
            <span>最后一次穿着</span>
            <input
              type="date"
              value={lastWornDate}
              max={TODAY_INPUT_VALUE}
              onChange={(event) => setLastWornDate(event.target.value)}
            />
          </label>
        </div>
        <p className="field-help">之后也可以在单品详情里点“今天穿了”，快速累计次数。</p>

        <label className="field full">
          <span>备注</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="版型、材质、购买信息，任何你想记住的细节"
            rows={3}
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        <footer className="form-footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit" disabled={imageBusy}>
            {initial ? "保存修改" : "加入衣橱"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ArchiveEditor({
  item,
  onClose,
  onSave,
}: {
  item: ClothingItem;
  onClose: () => void;
  onSave: (
    item: ClothingItem,
    details: {
      disposition: ArchiveDisposition;
      purchasePrice: number | null;
      resalePrice: number | null;
    },
  ) => void;
}) {
  const [disposition, setDisposition] = useState<ArchiveDisposition>(
    item.archiveDisposition,
  );
  const [purchasePrice, setPurchasePrice] = useState(
    item.price === null ? "" : String(item.price),
  );
  const [resalePrice, setResalePrice] = useState(
    item.resalePrice === null ? "" : String(item.resalePrice),
  );
  const [error, setError] = useState("");

  const parsedPurchasePrice = purchasePrice.trim() ? Number(purchasePrice) : null;
  const parsedResalePrice = resalePrice.trim() ? Number(resalePrice) : null;
  const previewFinalCost =
    parsedPurchasePrice !== null && Number.isFinite(parsedPurchasePrice)
      ? disposition === "discarded"
        ? parsedPurchasePrice
        : disposition === "resold" &&
            parsedResalePrice !== null &&
            Number.isFinite(parsedResalePrice)
          ? parsedPurchasePrice - parsedResalePrice
          : null
      : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      parsedPurchasePrice !== null &&
      (!Number.isFinite(parsedPurchasePrice) || parsedPurchasePrice < 0)
    ) {
      setError("购买价格需要是大于或等于 0 的数字");
      return;
    }
    if (
      disposition === "resold" &&
      (parsedResalePrice === null ||
        !Number.isFinite(parsedResalePrice) ||
        parsedResalePrice < 0)
    ) {
      setError("出二手时，请填写实际成交价");
      return;
    }
    onSave(item, {
      disposition,
      purchasePrice: parsedPurchasePrice,
      resalePrice: disposition === "resold" ? parsedResalePrice : null,
    });
  }

  return (
    <Modal
      eyebrow={item.archived ? "更新归档" : "结束使用"}
      title={item.archived ? "编辑归档信息" : `归档“${item.name}”`}
      onClose={onClose}
    >
      <form className="editor-form archive-form" onSubmit={submit}>
        <fieldset className="archive-choice-fieldset">
          <legend>这件衣服去了哪里？</legend>
          <div className="archive-choice-grid">
            {(Object.keys(ARCHIVE_DETAILS) as ArchiveDisposition[]).map((value) => (
              <button
                className={disposition === value ? "active" : ""}
                type="button"
                aria-pressed={disposition === value}
                key={value}
                onClick={() => {
                  setDisposition(value);
                  setError("");
                }}
              >
                <strong>{ARCHIVE_DETAILS[value].label}</strong>
                <small>{ARCHIVE_DETAILS[value].description}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field-row archive-price-row">
          <label className="field">
            <span>当时购买价格（元）</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              placeholder="例如：599"
            />
          </label>
          {disposition === "resold" && (
            <label className="field">
              <span>二手实际成交价（元）*</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={resalePrice}
                onChange={(event) => setResalePrice(event.target.value)}
                placeholder="例如：220"
              />
            </label>
          )}
        </div>

        <div className={`archive-cost-preview disposition-${disposition}`}>
          <span>最终使用成本</span>
          {disposition === "undecided" ? (
            <strong>去向确认后计算</strong>
          ) : previewFinalCost === null ? (
            <strong>补充价格后计算</strong>
          ) : (
            <>
              <strong>{formatPrice(previewFinalCost)}</strong>
              <small>
                {disposition === "resold" && parsedResalePrice !== null
                  ? `${formatPrice(parsedPurchasePrice as number)} − ${formatPrice(parsedResalePrice)}`
                  : "报废后，购买价格即为最终使用成本"}
                {item.wearCount > 0
                  ? ` · 最终每次 ${formatPrice(previewFinalCost / item.wearCount)}`
                  : ""}
              </small>
            </>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}
        <footer className="form-footer">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit">
            {item.archived ? "保存归档信息" : "确认归档"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function OutfitEditor({
  initial,
  seedItemIds,
  preferredSeason,
  items,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Outfit | null;
  seedItemIds: string[];
  preferredSeason: OutfitSeason;
  items: ClothingItem[];
  onClose: () => void;
  onSave: (outfit: Outfit) => void;
  onDelete: (outfit: Outfit) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [season, setSeason] = useState<OutfitSeason>(
    initial?.season ??
      (seedItemIds.length
        ? inferOutfitSeason(seedItemIds, items)
        : preferredSeason),
  );
  const [occasion, setOccasion] = useState(initial?.occasion ?? OCCASIONS[0]);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.itemIds ?? seedItemIds);
  const [error, setError] = useState("");
  const selectableItems = items.filter((item) => !item.archived || selected.includes(item.id));

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("给这套搭配起个名字吧");
      return;
    }
    if (selected.length === 0) {
      setError("至少选择一件单品");
      return;
    }
    const now = Date.now();
    onSave({
      id: initial?.id ?? makeId(),
      name: name.trim(),
      season,
      occasion,
      notes: notes.trim(),
      itemIds: selected,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <Modal
      eyebrow={initial ? "更新搭配" : "组合单品"}
      title={initial ? "编辑这套搭配" : "记录一套搭配"}
      onClose={onClose}
    >
      <form className="editor-form outfit-form" onSubmit={submit}>
        <div className="field-row">
          <label className="field grow">
            <span>搭配名称 *</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：周五轻松通勤"
              autoFocus
            />
          </label>
          <label className="field occasion-field">
            <span>场合</span>
            <select value={occasion} onChange={(event) => setOccasion(event.target.value)}>
              {OCCASIONS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field season-field">
            <span>季节</span>
            <select
              value={season}
              onChange={(event) => setSeason(event.target.value as OutfitSeason)}
            >
              {OUTFIT_SEASONS.map((value) => (
                <option key={value} value={value}>
                  {value}季
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="picker-fieldset">
          <legend>
            选择单品 <span>{selected.length} 件</span>
          </legend>
          {selectableItems.length > 0 ? (
            <div className="item-picker">
              {selectableItems.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <button
                    className={`picker-card ${isSelected ? "selected" : ""}`}
                    type="button"
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    aria-pressed={isSelected}
                  >
                    <GarmentVisual item={item} />
                    <span className="picker-check">{isSelected ? "✓" : "＋"}</span>
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="inline-empty">
              <span>衣橱还是空的</span>
              <small>先添加单品，才能把它们组合成搭配。</small>
            </div>
          )}
        </fieldset>

        <label className="field full">
          <span>搭配心得</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="为什么喜欢这套、适合什么天气、下次可以怎么调整"
            rows={3}
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        <footer className="form-footer split">
          <div>
            {initial && (
              <button className="danger-text-button" type="button" onClick={() => onDelete(initial)}>
                删除搭配
              </button>
            )}
          </div>
          <div className="footer-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit">
              {initial ? "保存修改" : "保存搭配"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("wardrobe");
  const [outfitSeason, setOutfitSeason] = useState<OutfitSeason>(
    currentOutfitSeason,
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [wardrobeSort, setWardrobeSort] = useState<WardrobeSort>("updated");
  const [showAttentionOnly, setShowAttentionOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState>(null);
  const [archiveEditor, setArchiveEditor] = useState<ClothingItem | null>(null);
  const [outfitEditor, setOutfitEditor] = useState<OutfitEditorState>(null);
  const [storageMessage, setStorageMessage] = useState("正在打开你的衣橱…");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    loadState()
      .then((stored) => {
        if (!active) return;
        const storedItems = Array.isArray(stored.items)
          ? stored.items.map(normalizeItem)
          : [];
        const storedOutfits = Array.isArray(stored.outfits) ? stored.outfits : [];
        setState({
          items: storedItems,
          outfits: storedOutfits.map((outfit) => ({
            ...outfit,
            season: isOutfitSeason(outfit.season)
              ? outfit.season
              : inferOutfitSeason(outfit.itemIds, storedItems),
          })),
        });
        setStorageMessage("已保存在这台设备");
      })
      .catch(() => {
        if (!active) return;
        setStorageMessage("当前浏览器无法保存数据");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState(state)
        .then(() => setStorageMessage("已保存在这台设备"))
        .catch(() => setStorageMessage("保存失败，请检查浏览器存储权限"));
    }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  const activeItems = useMemo(
    () => state.items.filter((item) => !item.archived),
    [state.items],
  );

  const archivedItems = useMemo(
    () => state.items.filter((item) => item.archived),
    [state.items],
  );

  const archiveStats = useMemo(
    () => ({
      total: archivedItems.length,
      resold: archivedItems.filter((item) => item.archiveDisposition === "resold")
        .length,
      discarded: archivedItems.filter(
        (item) => item.archiveDisposition === "discarded",
      ).length,
      undecided: archivedItems.filter(
        (item) => item.archiveDisposition === "undecided",
      ).length,
    }),
    [archivedItems],
  );

  const totalWearCount = useMemo(
    () => activeItems.reduce((total, item) => total + item.wearCount, 0),
    [activeItems],
  );

  const attentionCount = useMemo(
    () => activeItems.filter(isUsageAttentionNeeded).length,
    [activeItems],
  );

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.items
      .filter((item) => (showArchived ? item.archived : !item.archived))
      .filter((item) => category === "全部" || item.category === category)
      .filter(
        (item) => showArchived || !showAttentionOnly || isUsageAttentionNeeded(item),
      )
      .filter((item) => {
        if (!keyword) return true;
        return [
          item.name,
          item.category,
          item.color,
          item.season,
          item.notes,
          archiveLabel(item),
          item.price,
          item.resalePrice,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => {
        if (wardrobeSort === "unworn") {
          const aDate = a.lastWornAt ?? 0;
          const bDate = b.lastWornAt ?? 0;
          return aDate - bDate || a.createdAt - b.createdAt;
        }
        if (wardrobeSort === "most-worn") {
          return b.wearCount - a.wearCount || b.updatedAt - a.updatedAt;
        }
        if (wardrobeSort === "cost-high") {
          return (
            (averageWearCost(b) ?? -1) - (averageWearCost(a) ?? -1) ||
            b.updatedAt - a.updatedAt
          );
        }
        if (wardrobeSort === "final-cost-high") {
          return (
            (finalUsageCost(b) ?? -Infinity) -
              (finalUsageCost(a) ?? -Infinity) ||
            b.updatedAt - a.updatedAt
          );
        }
        return b.updatedAt - a.updatedAt;
      });
  }, [category, search, showArchived, showAttentionOnly, state.items, wardrobeSort]);

  const selectedItem = state.items.find((item) => item.id === selectedItemId) ?? null;
  const selectedOutfit =
    state.outfits.find((outfit) => outfit.id === selectedOutfitId) ?? null;
  const seasonalOutfits = useMemo(
    () =>
      state.outfits
        .filter((outfit) => outfit.season === outfitSeason)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [outfitSeason, state.outfits],
  );
  const relatedOutfits = selectedItem
    ? state.outfits.filter((outfit) => outfit.itemIds.includes(selectedItem.id))
    : [];

  function saveItem(item: ClothingItem) {
    setState((current) => {
      const exists = current.items.some((value) => value.id === item.id);
      return {
        ...current,
        items: exists
          ? current.items.map((value) => (value.id === item.id ? item : value))
          : [item, ...current.items],
      };
    });
    setItemEditor(null);
    if (!item.archived) setShowArchived(false);
    setSelectedItemId(item.id);
  }

  function saveOutfit(outfit: Outfit) {
    setState((current) => {
      const exists = current.outfits.some((value) => value.id === outfit.id);
      return {
        ...current,
        outfits: exists
          ? current.outfits.map((value) => (value.id === outfit.id ? outfit : value))
          : [outfit, ...current.outfits],
      };
    });
    setOutfitEditor(null);
    setSelectedOutfitId(outfit.id);
    setSelectedItemId(null);
    setOutfitSeason(outfit.season);
    setView("outfits");
  }

  function deleteOutfit(outfit: Outfit) {
    if (!window.confirm(`确定删除“${outfit.name}”吗？`)) return;
    setState((current) => ({
      ...current,
      outfits: current.outfits.filter((value) => value.id !== outfit.id),
    }));
    setOutfitEditor(null);
    setSelectedOutfitId(null);
  }

  function saveArchive(
    item: ClothingItem,
    details: {
      disposition: ArchiveDisposition;
      purchasePrice: number | null;
      resalePrice: number | null;
    },
  ) {
    const now = Date.now();
    setState((current) => ({
      ...current,
      items: current.items.map((value) =>
        value.id === item.id
          ? {
              ...value,
              price: details.purchasePrice,
              archived: true,
              archiveDisposition: details.disposition,
              resalePrice:
                details.disposition === "resold" ? details.resalePrice : null,
              archivedAt: value.archivedAt ?? now,
              updatedAt: now,
            }
          : value,
      ),
    }));
    setArchiveEditor(null);
    setShowArchived(true);
    setShowAttentionOnly(false);
    setSelectedItemId(item.id);
    setView("wardrobe");
  }

  function restoreItem(item: ClothingItem) {
    setState((current) => ({
      ...current,
      items: current.items.map((value) =>
        value.id === item.id
          ? {
              ...value,
              archived: false,
              archiveDisposition: "undecided",
              resalePrice: null,
              archivedAt: null,
              updatedAt: Date.now(),
            }
          : value,
      ),
    }));
    setSelectedItemId(null);
    setShowArchived(false);
  }

  function recordWear(item: ClothingItem) {
    setState((current) => ({
      ...current,
      items: current.items.map((value) =>
        value.id === item.id
          ? {
              ...value,
              wearCount: value.wearCount + 1,
              lastWornAt: Date.now(),
              updatedAt: Date.now(),
            }
          : value,
      ),
    }));
  }

  function beginOutfitFromItem(itemId: string) {
    setSelectedItemId(null);
    setOutfitEditor({ seedItemIds: [itemId] });
  }

  function navigate(nextView: View) {
    setView(nextView);
    if (nextView === "outfits") setShowAttentionOnly(false);
    setSelectedItemId(null);
    setSelectedOutfitId(null);
  }

  function openWardrobe() {
    setShowArchived(false);
    setShowAttentionOnly(false);
    setWardrobeSort("updated");
    navigate("wardrobe");
  }

  function openArchive() {
    setShowArchived(true);
    setShowAttentionOnly(false);
    setWardrobeSort("updated");
    navigate("wardrobe");
  }

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <a className="brand-mark" href="#top" aria-label="THE LOOK BOOK 首页">
          <span>TLB</span>
          <strong>THE LOOK BOOK</strong>
          <small>PERSONAL DRESSING ROOM</small>
        </a>

        <nav className="desktop-nav" aria-label="主要导航">
          <button
            className={view === "wardrobe" && !showArchived ? "active" : ""}
            type="button"
            onClick={openWardrobe}
          >
            <span>01</span>
            衣橱
          </button>
          <button
            className={view === "outfits" ? "active" : ""}
            type="button"
            onClick={() => navigate("outfits")}
          >
            <span>02</span>
            衣帽间
          </button>
          <button
            className={view === "wardrobe" && showArchived ? "active" : ""}
            type="button"
            onClick={openArchive}
          >
            <span>03</span>
            归档
          </button>
        </nav>

        <div className="rail-note">
          <span className="status-dot" />
          <p>{storageMessage}</p>
        </div>
      </aside>

      <div className="content" id="top">
        <header className="topbar">
          <div className="mobile-brand">
            <span>TLB</span>
            <strong>THE LOOK BOOK</strong>
          </div>
          <p>
            {view === "outfits"
              ? "MY DRESSING ROOM"
              : showArchived
                ? "MY ARCHIVE"
                : "MY WARDROBE"}
          </p>
          <button
            className="header-add"
            type="button"
            onClick={() =>
              view === "wardrobe" ? setItemEditor("new") : setOutfitEditor({})
            }
          >
            <span>＋</span>
            {view === "wardrobe" ? "添加单品" : "新建搭配"}
          </button>
        </header>

        {view === "wardrobe" ? (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">
                  {showArchived ? "WARDROBE ARCHIVE" : "YOUR DAILY WARDROBE"}
                </p>
                {showArchived ? (
                  <h1>
                    离开衣橱，
                    <br />
                    去向也值得记录。
                  </h1>
                ) : (
                  <h1>
                    今天想穿什么？
                    <br />
                    从喜欢的衣服开始。
                  </h1>
                )}
              </div>
              <p className="hero-copy">
                {showArchived
                  ? "记录报废或二手成交信息，算清每件衣服从买入到离开的最终使用成本。"
                  : "把常穿的衣服放进来，随手记录搭配。找衣服、换季和出门前，都更轻松。"}
              </p>
            </section>

            <section className="stats" aria-label={showArchived ? "归档概览" : "衣橱概览"}>
              <div>
                <strong>
                  {(showArchived ? archiveStats.total : activeItems.length)
                    .toString()
                    .padStart(2, "0")}
                </strong>
                <span>{showArchived ? "件已归档" : "件单品"}</span>
              </div>
              <div>
                <strong>
                  {(showArchived ? archiveStats.resold : totalWearCount)
                    .toString()
                    .padStart(2, "0")}
                </strong>
                <span>{showArchived ? "件已出二手" : "次穿着"}</span>
              </div>
              <div>
                <strong>
                  {(showArchived ? archiveStats.discarded : attentionCount)
                    .toString()
                    .padStart(2, "0")}
                </strong>
                <span>{showArchived ? "件已报废" : "件待关注"}</span>
              </div>
              <p>
                {showArchived
                  ? `${archiveStats.undecided} 件还在待处理，补充去向后即可计算最终成本。`
                  : "记录每次穿着，单次成本和清理建议会越来越准确。"}
              </p>
            </section>

            <section className="collection-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    {showArchived ? "ARCHIVE RECORDS" : "YOUR CLOSET"}
                  </p>
                  <h2>{showArchived ? "已归档单品" : "我的衣橱"}</h2>
                </div>
                <div className="wardrobe-tools">
                  <label className="search-field">
                    <span>⌕</span>
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索名称、颜色…"
                      aria-label="搜索单品"
                    />
                  </label>
                  <button
                    className={`archive-toggle ${showArchived ? "active" : ""}`}
                    type="button"
                    onClick={() => (showArchived ? openWardrobe() : openArchive())}
                  >
                    {showArchived
                      ? "返回在穿衣橱"
                      : `归档衣物 ${archivedItems.length}`}
                  </button>
                </div>
              </div>

              {showArchived && (
                <div className="archive-summary">
                  <div>
                    <span className="disposition-chip disposition-resold">
                      已出二手 {archiveStats.resold}
                    </span>
                    <span className="disposition-chip disposition-discarded">
                      已报废 {archiveStats.discarded}
                    </span>
                    <span className="disposition-chip disposition-undecided">
                      待处理 {archiveStats.undecided}
                    </span>
                  </div>
                  <p>最终使用成本 = 购买价格 − 二手成交价；报废时即为购买价格。</p>
                </div>
              )}

              <div className="wardrobe-filter-row">
                <div className="category-tabs" role="tablist" aria-label="按分类筛选">
                  {["全部", ...CATEGORIES].map((value) => (
                    <button
                      className={category === value ? "active" : ""}
                      type="button"
                      role="tab"
                      aria-selected={category === value}
                      key={value}
                      onClick={() => setCategory(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="usage-controls">
                  {!showArchived && (
                    <button
                      className={`attention-toggle ${showAttentionOnly ? "active" : ""}`}
                      type="button"
                      aria-pressed={showAttentionOnly}
                      onClick={() => setShowAttentionOnly((current) => !current)}
                    >
                      待关注 {attentionCount}
                    </button>
                  )}
                  <label className="sort-field">
                    <span className="visually-hidden">单品排序</span>
                    <select
                      value={wardrobeSort}
                      onChange={(event) =>
                        setWardrobeSort(event.target.value as WardrobeSort)
                      }
                    >
                      <option value="updated">最近更新</option>
                      <option value="unworn">久未穿优先</option>
                      <option value="most-worn">穿着最多</option>
                      <option value="cost-high">单次成本最高</option>
                      {showArchived && (
                        <option value="final-cost-high">最终成本最高</option>
                      )}
                    </select>
                  </label>
                </div>
              </div>

              {filteredItems.length > 0 ? (
                <div className="garment-grid">
                  {filteredItems.map((item, index) => {
                    const outfitCount = state.outfits.filter((outfit) =>
                      outfit.itemIds.includes(item.id),
                    ).length;
                    const wearCost = averageWearCost(item);
                    const archivedCost = finalUsageCost(item);
                    const needsAttention = !item.archived && isUsageAttentionNeeded(item);
                    return (
                      <button
                        className="garment-card"
                        type="button"
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        <span className="card-index">
                          {(index + 1).toString().padStart(2, "0")}
                        </span>
                        <div className="garment-visual">
                          <GarmentVisual item={item} />
                        </div>
                        <div className="garment-meta">
                          <div>
                            <span>
                              {item.category}
                              {item.price !== null ? ` · ${formatPrice(item.price)}` : ""}
                            </span>
                            <h3>{item.name}</h3>
                          </div>
                          <span className="look-count">{outfitCount} 套搭配</span>
                        </div>
                        <div className={`wear-summary ${needsAttention ? "attention" : ""}`}>
                          <span>{lastWornLabel(item)}</span>
                          <strong>
                            {item.wearCount} 次
                            {wearCost !== null
                              ? ` · ${formatPrice(wearCost)}/次`
                              : item.price !== null
                                ? " · 穿一次后计算成本"
                                : " · 价格未记录"}
                          </strong>
                        </div>
                        {item.archived && (
                          <div
                            className={`archive-card-summary disposition-${item.archiveDisposition}`}
                          >
                            <span>{archiveLabel(item)}</span>
                            <strong>
                              {archivedCost !== null
                                ? `最终成本 ${formatPrice(archivedCost)}`
                                : "最终成本待确认"}
                            </strong>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-wardrobe-visual" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                  <p className="eyebrow">
                    {showArchived && !search && category === "全部"
                      ? "归档还是空的"
                      : search || category !== "全部" || showAttentionOnly
                        ? "没有找到匹配的单品"
                        : "从第一件开始"}
                  </p>
                  <h3>
                    {showArchived && !search && category === "全部"
                      ? "暂时没有归档衣物"
                      : search || category !== "全部" || showAttentionOnly
                        ? "换个筛选条件看看"
                        : "把常穿的衣服放进来"}
                  </h3>
                  <p>
                    {showArchived && !search && category === "全部"
                      ? "当你归档一件衣服，它会连同去向、二手成交价和最终成本出现在这里。"
                      : search || category !== "全部" || showAttentionOnly
                        ? "清除搜索或切换分类，衣服可能就在别处。"
                        : "拍一张照片、填个名字即可。之后随时可以补充信息。"}
                  </p>
                  {!search && category === "全部" && !showArchived && !showAttentionOnly && (
                    <button className="primary-button" type="button" onClick={() => setItemEditor("new")}>
                      ＋ 添加第一件单品
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="hero lookbook-hero">
              <div>
                <p className="eyebrow">SEASONAL LOOKS</p>
                <h1>
                  春夏秋冬，
                  <br />
                  都穿得开心。
                </h1>
              </div>
              <p className="hero-copy">
                按季节收好每套搭配。换季或出门前，
                打开对应的一格就能快速找到。
              </p>
            </section>

            <section className="lookbook-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{SEASON_DETAILS[outfitSeason].english} LOOKS</p>
                  <h2>{outfitSeason}季搭配</h2>
                </div>
                <p className="section-count">{state.outfits.length} 套记录</p>
              </div>

              <div className="season-tabs" role="tablist" aria-label="按季节筛选搭配">
                {OUTFIT_SEASONS.map((season) => {
                  const count = state.outfits.filter(
                    (outfit) => outfit.season === season,
                  ).length;
                  const detail = SEASON_DETAILS[season];
                  return (
                    <button
                      className={outfitSeason === season ? "active" : ""}
                      type="button"
                      role="tab"
                      aria-selected={outfitSeason === season}
                      key={season}
                      onClick={() => setOutfitSeason(season)}
                    >
                      <span className="season-mark">{detail.mark}</span>
                      <span className="season-name">
                        <strong>{season}</strong>
                        <small>{detail.english}</small>
                      </span>
                      <span className="season-note">
                        {detail.note} · {count.toString().padStart(2, "0")}
                      </span>
                    </button>
                  );
                })}
              </div>

              {seasonalOutfits.length > 0 ? (
                <div className="outfit-grid">
                  {seasonalOutfits.map((outfit, index) => (
                      <button
                        className="outfit-card"
                        type="button"
                        key={outfit.id}
                        onClick={() => setSelectedOutfitId(outfit.id)}
                      >
                        <OutfitCollage outfit={outfit} items={state.items} />
                        <div className="outfit-card-copy">
                          <div className="outfit-card-kicker">
                            <span className="card-index">
                              LOOK {(index + 1).toString().padStart(2, "0")}
                            </span>
                            <span className="season-chip">{outfit.season}季</span>
                          </div>
                          <h3>{outfit.name}</h3>
                          <p>
                            {outfit.occasion} · {outfit.itemIds.length} 件单品
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <div className="empty-state lookbook-empty">
                  <div className="empty-collage" aria-hidden="true">
                    <span>上</span>
                    <span>下</span>
                    <span>鞋</span>
                  </div>
                  <p className="eyebrow">{outfitSeason}季这一格还是空的</p>
                  <h3>{activeItems.length ? `记录第一套${outfitSeason}季搭配` : "先从添加单品开始"}</h3>
                  <p>
                    {activeItems.length
                      ? `选中几件衣服并保存，它们会被收进${outfitSeason}季衣帽间。`
                      : "衣橱有了单品之后，就能在这里自由组合。"}
                  </p>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() =>
                      activeItems.length ? setOutfitEditor({}) : openWardrobe()
                    }
                  >
                    {activeItems.length ? "＋ 新建第一套搭配" : "去添加单品"}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <nav className="mobile-nav" aria-label="移动端导航">
        <button
          className={view === "wardrobe" && !showArchived ? "active" : ""}
          type="button"
          onClick={openWardrobe}
        >
          <span>衣</span>
          衣橱
        </button>
        <button
          className={view === "outfits" ? "active" : ""}
          type="button"
          onClick={() => navigate("outfits")}
        >
          <span>搭</span>
          衣帽间
        </button>
        <button
          className={view === "wardrobe" && showArchived ? "active" : ""}
          type="button"
          onClick={openArchive}
        >
          <span>存</span>
          归档
        </button>
      </nav>

      {selectedItem && (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedItemId(null)}>
          <aside
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="drawer-header">
              <p className="eyebrow">单品档案</p>
              <CloseButton onClick={() => setSelectedItemId(null)} />
            </header>
            <div className="drawer-visual">
              <GarmentVisual item={selectedItem} />
            </div>
            <div className="drawer-title">
              <div>
                <span>{selectedItem.category}</span>
                <h2 id="item-detail-title">{selectedItem.name}</h2>
              </div>
              <button
                className="secondary-button small"
                type="button"
                onClick={() => {
                  setItemEditor(selectedItem);
                  setSelectedItemId(null);
                }}
              >
                编辑
              </button>
            </div>
            <dl className="item-facts">
              <div>
                <dt>颜色</dt>
                <dd>{selectedItem.color || "未记录"}</dd>
              </div>
              <div>
                <dt>季节</dt>
                <dd>{selectedItem.season}</dd>
              </div>
              <div>
                <dt>更新</dt>
                <dd>{formatDate(selectedItem.updatedAt)}</dd>
              </div>
            </dl>

            {selectedItem.archived && (
              <section
                className={`archive-record disposition-${selectedItem.archiveDisposition}`}
              >
                <div className="archive-record-heading">
                  <div>
                    <p className="eyebrow">ARCHIVE STATUS</p>
                    <h3>{archiveLabel(selectedItem)}</h3>
                  </div>
                  <span>{ARCHIVE_DETAILS[selectedItem.archiveDisposition].description}</span>
                </div>
                <dl>
                  <div>
                    <dt>归档日期</dt>
                    <dd>
                      {selectedItem.archivedAt
                        ? formatDate(selectedItem.archivedAt)
                        : "未记录"}
                    </dd>
                  </div>
                  {selectedItem.archiveDisposition === "resold" && (
                    <div>
                      <dt>二手成交价</dt>
                      <dd>
                        {selectedItem.resalePrice !== null
                          ? formatPrice(selectedItem.resalePrice)
                          : "待补充"}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>最终使用成本</dt>
                    <dd>
                      {finalUsageCost(selectedItem) !== null
                        ? formatPrice(finalUsageCost(selectedItem) as number)
                        : "待确认"}
                    </dd>
                  </div>
                  <div>
                    <dt>最终单次成本</dt>
                    <dd>
                      {finalCostPerWear(selectedItem) !== null
                        ? `${formatPrice(finalCostPerWear(selectedItem) as number)}/次`
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            <section className="usage-panel" aria-live="polite">
              <div className="usage-panel-heading">
                <div>
                  <p className="eyebrow">WEAR EFFICIENCY</p>
                  <h3>这件衣服的使用效率</h3>
                </div>
                {!selectedItem.archived && (
                  <button
                    className="record-wear-button"
                    type="button"
                    onClick={() => recordWear(selectedItem)}
                  >
                    ＋ 今天穿了
                  </button>
                )}
              </div>
              <div className="usage-metrics">
                <div>
                  <span>累计穿着</span>
                  <strong>{selectedItem.wearCount} 次</strong>
                </div>
                <div>
                  <span>购买价格</span>
                  <strong>
                    {selectedItem.price !== null
                      ? formatPrice(selectedItem.price)
                      : "未记录"}
                  </strong>
                </div>
                <div>
                  <span>平均单次成本</span>
                  <strong>
                    {averageWearCost(selectedItem) !== null
                      ? formatPrice(averageWearCost(selectedItem) as number)
                      : selectedItem.price !== null
                        ? "待开穿"
                        : "—"}
                  </strong>
                </div>
              </div>
              <p className={isUsageAttentionNeeded(selectedItem) ? "attention" : ""}>
                {lastWornLabel(selectedItem)}
                {selectedItem.lastWornAt &&
                daysSince(selectedItem.lastWornAt) >= LONG_UNWORN_DAYS
                  ? " · 已超过 90 天，可以考虑重新搭配或清理"
                  : !selectedItem.lastWornAt
                    ? " · 记录一次后就能开始追踪使用效率"
                    : " · 仍在活跃使用中"}
              </p>
            </section>
            {selectedItem.notes && <p className="item-notes">{selectedItem.notes}</p>}

            <section className="related-section">
              <div className="related-heading">
                <div>
                  <p className="eyebrow">RELATED LOOKS</p>
                  <h3>包含它的搭配</h3>
                </div>
                <span>{relatedOutfits.length}</span>
              </div>
              {relatedOutfits.length > 0 ? (
                <div className="related-list">
                  {relatedOutfits.map((outfit) => (
                    <button
                      type="button"
                      key={outfit.id}
                      onClick={() => {
                        setSelectedItemId(null);
                        setSelectedOutfitId(outfit.id);
                      }}
                    >
                      <OutfitCollage outfit={outfit} items={state.items} compact />
                      <span>
                        <strong>{outfit.name}</strong>
                        <small>
                          {outfit.occasion} · {outfit.itemIds.length} 件
                        </small>
                      </span>
                      <i>→</i>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="related-empty">
                  <p>这件衣服还没有出现在任何搭配里。</p>
                </div>
              )}
              {!selectedItem.archived && (
                <button
                  className="wide-outline-button"
                  type="button"
                  onClick={() => beginOutfitFromItem(selectedItem.id)}
                >
                  ＋ 用它创建搭配
                </button>
              )}
            </section>

            {selectedItem.archived ? (
              <div className="archive-detail-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setArchiveEditor(selectedItem);
                    setSelectedItemId(null);
                  }}
                >
                  编辑归档信息
                </button>
                <button
                  className="archive-action"
                  type="button"
                  onClick={() => restoreItem(selectedItem)}
                >
                  恢复到衣橱
                </button>
              </div>
            ) : (
              <button
                className="archive-action"
                type="button"
                onClick={() => {
                  setArchiveEditor(selectedItem);
                  setSelectedItemId(null);
                }}
              >
                归档这件单品
              </button>
            )}
          </aside>
        </div>
      )}

      {selectedOutfit && (
        <div className="drawer-backdrop" onMouseDown={() => setSelectedOutfitId(null)}>
          <aside
            className="detail-drawer outfit-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outfit-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="drawer-header">
              <p className="eyebrow">搭配档案</p>
              <CloseButton onClick={() => setSelectedOutfitId(null)} />
            </header>
            <OutfitCollage outfit={selectedOutfit} items={state.items} />
            <div className="drawer-title">
              <div>
                <span>
                  {selectedOutfit.season}季 · {selectedOutfit.occasion}
                </span>
                <h2 id="outfit-detail-title">{selectedOutfit.name}</h2>
              </div>
              <button
                className="secondary-button small"
                type="button"
                onClick={() => {
                  setOutfitEditor({ outfit: selectedOutfit });
                  setSelectedOutfitId(null);
                }}
              >
                编辑
              </button>
            </div>
            {selectedOutfit.notes && <p className="item-notes">{selectedOutfit.notes}</p>}
            <section className="related-section">
              <div className="related-heading">
                <div>
                  <p className="eyebrow">PIECES</p>
                  <h3>这套搭配的单品</h3>
                </div>
                <span>{selectedOutfit.itemIds.length}</span>
              </div>
              <div className="outfit-piece-list">
                {selectedOutfit.itemIds.map((id) => {
                  const item = state.items.find((value) => value.id === id);
                  if (!item) return null;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setSelectedOutfitId(null);
                        setSelectedItemId(item.id);
                      }}
                    >
                      <GarmentVisual item={item} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.category}
                          {item.archived ? " · 已归档" : ""}
                        </small>
                      </span>
                      <i>→</i>
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>
      )}

      {itemEditor && (
        <ItemEditor
          initial={itemEditor === "new" ? null : itemEditor}
          onClose={() => setItemEditor(null)}
          onSave={saveItem}
        />
      )}

      {archiveEditor && (
        <ArchiveEditor
          item={archiveEditor}
          onClose={() => setArchiveEditor(null)}
          onSave={saveArchive}
        />
      )}

      {outfitEditor && (
        <OutfitEditor
          initial={outfitEditor.outfit ?? null}
          seedItemIds={outfitEditor.seedItemIds ?? []}
          preferredSeason={outfitSeason}
          items={state.items}
          onClose={() => setOutfitEditor(null)}
          onSave={saveOutfit}
          onDelete={deleteOutfit}
        />
      )}
    </main>
  );
}
