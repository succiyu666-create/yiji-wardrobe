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

type ClothingItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  season: string;
  notes: string;
  image: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

type Outfit = {
  id: string;
  name: string;
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
type ItemEditorState = ClothingItem | "new" | null;
type OutfitEditorState =
  | { outfit?: Outfit; seedItemIds?: string[] }
  | null;

const CATEGORIES = ["上衣", "下装", "外套", "连衣裙", "鞋履", "包袋", "配饰", "其他"];
const SEASONS = ["四季", "春夏", "秋冬", "春", "夏", "秋", "冬"];
const OCCASIONS = ["日常", "通勤", "约会", "旅行", "运动", "正式", "其他"];
const EMPTY_STATE: AppState = { items: [], outfits: [] };
const DB_NAME = "yiji-wardrobe";
const DB_VERSION = 1;
const STORE_NAME = "wardrobe";
const STATE_KEY = "current-state";

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
    const now = Date.now();
    onSave({
      id: initial?.id ?? makeId(),
      name: name.trim(),
      category,
      color: color.trim(),
      season,
      notes: notes.trim(),
      image,
      archived: initial?.archived ?? false,
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

function OutfitEditor({
  initial,
  seedItemIds,
  items,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Outfit | null;
  seedItemIds: string[];
  items: ClothingItem[];
  onClose: () => void;
  onSave: (outfit: Outfit) => void;
  onDelete: (outfit: Outfit) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState>(null);
  const [outfitEditor, setOutfitEditor] = useState<OutfitEditorState>(null);
  const [storageMessage, setStorageMessage] = useState("正在打开你的衣橱…");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    loadState()
      .then((stored) => {
        if (!active) return;
        setState({
          items: Array.isArray(stored.items) ? stored.items : [],
          outfits: Array.isArray(stored.outfits) ? stored.outfits : [],
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

  const unstyledCount = useMemo(() => {
    const used = new Set(state.outfits.flatMap((outfit) => outfit.itemIds));
    return activeItems.filter((item) => !used.has(item.id)).length;
  }, [activeItems, state.outfits]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.items
      .filter((item) => (showArchived ? item.archived : !item.archived))
      .filter((item) => category === "全部" || item.category === category)
      .filter((item) => {
        if (!keyword) return true;
        return [item.name, item.category, item.color, item.season, item.notes]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [category, search, showArchived, state.items]);

  const selectedItem = state.items.find((item) => item.id === selectedItemId) ?? null;
  const selectedOutfit =
    state.outfits.find((outfit) => outfit.id === selectedOutfitId) ?? null;
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

  function toggleArchive(item: ClothingItem) {
    const archived = !item.archived;
    setState((current) => ({
      ...current,
      items: current.items.map((value) =>
        value.id === item.id ? { ...value, archived, updatedAt: Date.now() } : value,
      ),
    }));
    if (!archived) setShowArchived(false);
    setSelectedItemId(null);
  }

  function beginOutfitFromItem(itemId: string) {
    setSelectedItemId(null);
    setOutfitEditor({ seedItemIds: [itemId] });
  }

  function navigate(nextView: View) {
    setView(nextView);
    setSelectedItemId(null);
    setSelectedOutfitId(null);
  }

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <a className="brand-mark" href="#top" aria-label="衣集首页">
          <span>衣</span>
          <strong>衣集</strong>
          <small>YI JI</small>
        </a>

        <nav className="desktop-nav" aria-label="主要导航">
          <button
            className={view === "wardrobe" ? "active" : ""}
            type="button"
            onClick={() => navigate("wardrobe")}
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
            搭配
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
            <span>衣</span>
            <strong>衣集</strong>
          </div>
          <p>{view === "wardrobe" ? "MY WARDROBE" : "MY LOOKBOOK"}</p>
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
                <p className="eyebrow">你的数字衣橱</p>
                <h1>
                  每一件衣服，
                  <br />
                  都有它的搭配故事。
                </h1>
              </div>
              <p className="hero-copy">
                上传单品、记录组合。以后点开一件衣服，
                就能找回所有穿过和想过的搭配。
              </p>
            </section>

            <section className="stats" aria-label="衣橱概览">
              <div>
                <strong>{activeItems.length.toString().padStart(2, "0")}</strong>
                <span>件单品</span>
              </div>
              <div>
                <strong>{state.outfits.length.toString().padStart(2, "0")}</strong>
                <span>套搭配</span>
              </div>
              <div>
                <strong>{unstyledCount.toString().padStart(2, "0")}</strong>
                <span>件待搭配</span>
              </div>
              <p>先记录，不必整理得完美。你的搭配档案会自然长出来。</p>
            </section>

            <section className="collection-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">WARDROBE INDEX</p>
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
                    onClick={() => setShowArchived((current) => !current)}
                  >
                    {showArchived ? "返回衣橱" : "查看归档"}
                  </button>
                </div>
              </div>

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

              {filteredItems.length > 0 ? (
                <div className="garment-grid">
                  {filteredItems.map((item, index) => {
                    const outfitCount = state.outfits.filter((outfit) =>
                      outfit.itemIds.includes(item.id),
                    ).length;
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
                            <span>{item.category}</span>
                            <h3>{item.name}</h3>
                          </div>
                          <span className="look-count">{outfitCount} 套搭配</span>
                        </div>
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
                    {search || category !== "全部" || showArchived
                      ? "没有找到匹配的单品"
                      : "从第一件开始"}
                  </p>
                  <h3>
                    {search || category !== "全部" || showArchived
                      ? "换个筛选条件看看"
                      : "把常穿的衣服放进来"}
                  </h3>
                  <p>
                    {search || category !== "全部" || showArchived
                      ? "清除搜索或切换分类，衣服可能就在别处。"
                      : "拍一张照片、填个名字即可。之后随时可以补充信息。"}
                  </p>
                  {!search && category === "全部" && !showArchived && (
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
                <p className="eyebrow">你的搭配灵感册</p>
                <h1>
                  好搭配，
                  <br />
                  值得被记住。
                </h1>
              </div>
              <p className="hero-copy">
                选择衣橱里的单品组合成一套造型，
                系统会自动生成拼贴封面。
              </p>
            </section>

            <section className="lookbook-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LOOKBOOK ARCHIVE</p>
                  <h2>全部搭配</h2>
                </div>
                <p className="section-count">{state.outfits.length} 套记录</p>
              </div>

              {state.outfits.length > 0 ? (
                <div className="outfit-grid">
                  {[...state.outfits]
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .map((outfit, index) => (
                      <button
                        className="outfit-card"
                        type="button"
                        key={outfit.id}
                        onClick={() => setSelectedOutfitId(outfit.id)}
                      >
                        <OutfitCollage outfit={outfit} items={state.items} />
                        <div className="outfit-card-copy">
                          <span className="card-index">
                            LOOK {(index + 1).toString().padStart(2, "0")}
                          </span>
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
                  <p className="eyebrow">还没有搭配记录</p>
                  <h3>{activeItems.length ? "把衣橱里的单品组合起来" : "先从添加单品开始"}</h3>
                  <p>
                    {activeItems.length
                      ? "选中几件衣服，命名并保存，就是你的第一套搭配。"
                      : "衣橱有了单品之后，就能在这里自由组合。"}
                  </p>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() =>
                      activeItems.length ? setOutfitEditor({}) : navigate("wardrobe")
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
          className={view === "wardrobe" ? "active" : ""}
          type="button"
          onClick={() => navigate("wardrobe")}
        >
          <span>衣</span>
          衣橱
        </button>
        <button
          className="mobile-add"
          type="button"
          aria-label={view === "wardrobe" ? "添加单品" : "新建搭配"}
          onClick={() =>
            view === "wardrobe" ? setItemEditor("new") : setOutfitEditor({})
          }
        >
          ＋
        </button>
        <button
          className={view === "outfits" ? "active" : ""}
          type="button"
          onClick={() => navigate("outfits")}
        >
          <span>搭</span>
          搭配
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

            <button
              className="archive-action"
              type="button"
              onClick={() => toggleArchive(selectedItem)}
            >
              {selectedItem.archived ? "恢复到衣橱" : "归档这件单品"}
            </button>
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
                <span>{selectedOutfit.occasion}</span>
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

      {outfitEditor && (
        <OutfitEditor
          initial={outfitEditor.outfit ?? null}
          seedItemIds={outfitEditor.seedItemIds ?? []}
          items={state.items}
          onClose={() => setOutfitEditor(null)}
          onSave={saveOutfit}
          onDelete={deleteOutfit}
        />
      )}
    </main>
  );
}
