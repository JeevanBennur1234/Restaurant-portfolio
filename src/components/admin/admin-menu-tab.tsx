"use client";

import * as React from "react";
import Image from "next/image";
import {
  Plus,
  Edit2,
  Trash2,
  Sliders,
  Upload,
  Search,
  RefreshCw,
  FolderPlus,
  Leaf,
  Beef,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatPaiseToINR, paiseToRupees } from "@/lib/currency";
import {
  getAdminMenuAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  createMenuItemAction,
  updateMenuItemAction,
  toggleMenuItemAvailabilityAction,
  deleteMenuItemAction,
  createModifierAction,
  deleteModifierAction,
  type AdminCategoryData,
  type AdminMenuItemData,
} from "@/server/actions/admin";

export function AdminMenuTab() {
  // Data state
  const [categories, setCategories] = React.useState<AdminCategoryData[]>([]);
  const [items, setItems] = React.useState<AdminMenuItemData[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Active view filters
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [vegFilter, setVegFilter] = React.useState<"all" | "veg" | "non-veg">("all");

  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<AdminCategoryData | null>(null);
  const [categoryName, setCategoryName] = React.useState("");
  const [categorySlug, setCategorySlug] = React.useState("");
  const [categorySortOrder, setCategorySortOrder] = React.useState(0);
  const [categoryIsActive, setCategoryIsActive] = React.useState(true);
  const [isSavingCategory, setIsSavingCategory] = React.useState(false);

  // Item Modal state
  const [isItemModalOpen, setIsItemModalOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<AdminMenuItemData | null>(null);
  const [itemName, setItemName] = React.useState("");
  const [itemCategoryId, setItemCategoryId] = React.useState("");
  const [itemPriceRupees, setItemPriceRupees] = React.useState(250);
  const [itemIsVeg, setItemIsVeg] = React.useState(true);
  const [itemPrepMinutes, setItemPrepMinutes] = React.useState(15);
  const [itemDescription, setItemDescription] = React.useState("");
  const [itemImageUrl, setItemImageUrl] = React.useState("");
  const [isUploadingImage, setIsUploadingImage] = React.useState(false);
  const [isSavingItem, setIsSavingItem] = React.useState(false);

  // Modifiers Management state
  const [managingModifiersItem, setManagingModifiersItem] =
    React.useState<AdminMenuItemData | null>(null);
  const [modGroupName, setModGroupName] = React.useState("");
  const [modName, setModName] = React.useState("");
  const [modPriceRupees, setModPriceRupees] = React.useState(0);
  const [modIsRequired, setModIsRequired] = React.useState(false);
  const [isAddingModifier, setIsAddingModifier] = React.useState(false);

  const fetchMenu = React.useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminMenuAction();
      if (res.success && res.categories && res.items) {
        setCategories(res.categories);
        setItems(res.items);
      } else {
        setError(res.error || "Failed to load menu data");
      }
    } catch (err) {
      setError((err as Error).message || "Error fetching menu");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    getAdminMenuAction().then((res) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (res.success && res.categories && res.items) {
        setCategories(res.categories);
        setItems(res.items);
      } else {
        setError(res.error || "Failed to load menu data");
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Quick Availability Toggle
  const handleToggleAvailability = async (item: AdminMenuItemData) => {
    const nextVal = !item.isAvailable;
    // Optimistic UI update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isAvailable: nextVal } : i))
    );

    try {
      const res = await toggleMenuItemAvailabilityAction({
        id: item.id,
        isAvailable: nextVal,
      });
      if (!res.success) {
        // Revert on error
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, isAvailable: !nextVal } : i))
        );
      }
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isAvailable: !nextVal } : i))
      );
    }
  };

  // Image Upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (json.success && json.url) {
        setItemImageUrl(json.url);
      } else {
        alert(json.error || "Failed to upload image");
      }
    } catch (err) {
      alert((err as Error).message || "Image upload failed");
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Open Category Create/Edit
  const openCategoryModal = (cat?: AdminCategoryData) => {
    if (cat) {
      setEditingCategory(cat);
      setCategoryName(cat.name);
      setCategorySlug(cat.slug);
      setCategorySortOrder(cat.sortOrder);
      setCategoryIsActive(cat.isActive);
    } else {
      setEditingCategory(null);
      setCategoryName("");
      setCategorySlug("");
      setCategorySortOrder(categories.length + 1);
      setCategoryIsActive(true);
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCategory(true);
    try {
      if (editingCategory) {
        await updateCategoryAction({
          id: editingCategory.id,
          name: categoryName,
          slug: categorySlug,
          sortOrder: categorySortOrder,
          isActive: categoryIsActive,
        });
      } else {
        await createCategoryAction({
          name: categoryName,
          slug: categorySlug,
          sortOrder: categorySortOrder,
        });
      }
      setIsCategoryModalOpen(false);
      await fetchMenu();
    } catch (err) {
      alert((err as Error).message || "Failed to save category");
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: AdminCategoryData) => {
    if (cat.itemCount > 0) {
      if (!confirm(`Category "${cat.name}" has ${cat.itemCount} items. Delete anyway?`)) {
        return;
      }
    } else if (!confirm(`Delete category "${cat.name}"?`)) {
      return;
    }

    try {
      await deleteCategoryAction({ id: cat.id });
      await fetchMenu();
    } catch (err) {
      alert((err as Error).message || "Failed to delete category");
    }
  };

  // Open Item Create/Edit
  const openItemModal = (item?: AdminMenuItemData) => {
    if (item) {
      setEditingItem(item);
      setItemName(item.name);
      setItemCategoryId(item.categoryId);
      setItemPriceRupees(paiseToRupees(item.pricePaise));
      setItemIsVeg(item.isVeg);
      setItemPrepMinutes(item.prepTimeMinutes);
      setItemDescription(item.description || "");
      setItemImageUrl(item.imageUrl || "");
    } else {
      setEditingItem(null);
      setItemName("");
      setItemCategoryId(
        selectedCategoryId !== "all" ? selectedCategoryId : (categories[0]?.id ?? "")
      );
      setItemPriceRupees(295);
      setItemIsVeg(true);
      setItemPrepMinutes(15);
      setItemDescription("");
      setItemImageUrl("");
    }
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !itemCategoryId) return;

    setIsSavingItem(true);
    try {
      if (editingItem) {
        await updateMenuItemAction({
          id: editingItem.id,
          name: itemName.trim(),
          categoryId: itemCategoryId,
          priceRupees: Number(itemPriceRupees),
          isVeg: itemIsVeg,
          prepTimeMinutes: Number(itemPrepMinutes),
          description: itemDescription.trim() || null,
          imageUrl: itemImageUrl.trim() || null,
          isAvailable: editingItem.isAvailable,
          sortOrder: editingItem.sortOrder,
        });
      } else {
        await createMenuItemAction({
          name: itemName.trim(),
          categoryId: itemCategoryId,
          priceRupees: Number(itemPriceRupees),
          isVeg: itemIsVeg,
          prepTimeMinutes: Number(itemPrepMinutes),
          description: itemDescription.trim() || null,
          imageUrl: itemImageUrl.trim() || null,
          isAvailable: true,
          sortOrder: items.length + 1,
        });
      }
      setIsItemModalOpen(false);
      await fetchMenu();
    } catch (err) {
      alert((err as Error).message || "Failed to save item");
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleDeleteItem = async (item: AdminMenuItemData) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;
    try {
      await deleteMenuItemAction({ id: item.id });
      await fetchMenu();
    } catch (err) {
      alert((err as Error).message || "Failed to delete item");
    }
  };

  // Modifiers Management
  const handleAddModifier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingModifiersItem || !modGroupName.trim() || !modName.trim()) return;

    setIsAddingModifier(true);
    try {
      const res = await createModifierAction({
        menuItemId: managingModifiersItem.id,
        groupName: modGroupName.trim(),
        name: modName.trim(),
        priceRupees: Number(modPriceRupees),
        isRequired: modIsRequired,
      });

      if (res.success) {
        setModName("");
        setModPriceRupees(0);
        await fetchMenu();
        // Update current item in sheet
        setManagingModifiersItem((prev) =>
          prev
            ? {
                ...prev,
                modifiers: [
                  ...prev.modifiers,
                  {
                    id: res.modifierId || `mod-${Date.now()}`,
                    menuItemId: prev.id,
                    groupName: modGroupName.trim(),
                    name: modName.trim(),
                    pricePaise: Math.round(Number(modPriceRupees) * 100),
                    isRequired: modIsRequired,
                  },
                ],
              }
            : null
        );
      }
    } finally {
      setIsAddingModifier(false);
    }
  };

  const handleDeleteModifier = async (modId: string) => {
    try {
      await deleteModifierAction({ id: modId });
      await fetchMenu();
      setManagingModifiersItem((prev) =>
        prev
          ? {
              ...prev,
              modifiers: prev.modifiers.filter((m) => m.id !== modId),
            }
          : null
      );
    } catch (err) {
      alert((err as Error).message || "Failed to delete modifier");
    }
  };

  // Filtered Items
  const filteredItems = items.filter((item) => {
    if (selectedCategoryId !== "all" && item.categoryId !== selectedCategoryId) {
      return false;
    }
    if (vegFilter === "veg" && !item.isVeg) return false;
    if (vegFilter === "non-veg" && item.isVeg) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
        <div>
          <h3 className="font-serif text-lg font-bold text-[var(--text-primary)]">
            Menu Catalog & Recipe Modifiers
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Manage live dining items, custom portions, spice levels, and instant availability toggles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openCategoryModal()}
            className="text-xs"
            leftIcon={<FolderPlus className="h-3.5 w-3.5" />}
          >
            Add Category
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => openItemModal()}
            className="text-xs"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Add Menu Item
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Categories Row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span className="font-mono uppercase font-semibold text-[10px] tracking-wider">
            Categories ({categories.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategoryId("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              selectedCategoryId === "all"
                ? "bg-[var(--primary)] text-white shadow-xs font-semibold"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
            }`}
          >
            All Items ({items.length})
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <div
                key={cat.id}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  isSelected
                    ? "bg-[var(--primary)] text-white border-[var(--primary)] font-semibold"
                    : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="cursor-pointer"
                >
                  {cat.name} ({cat.itemCount})
                </button>

                <div className="hidden group-hover:flex items-center gap-1 ml-1 pl-1 border-l border-current/30">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCategoryModal(cat);
                    }}
                    className="opacity-70 hover:opacity-100 cursor-pointer"
                    title="Edit category"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(cat);
                    }}
                    className="opacity-70 hover:opacity-100 text-red-500 cursor-pointer"
                    title="Delete category"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar for items */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name..."
            className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Veg Filter Pills */}
          <div className="flex rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setVegFilter("all")}
              className={`px-2.5 py-1 rounded-md cursor-pointer ${
                vegFilter === "all"
                  ? "bg-[var(--primary)] text-white font-semibold"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setVegFilter("veg")}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                vegFilter === "veg"
                  ? "bg-emerald-600 text-white font-semibold"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              <Leaf className="h-3 w-3" />
              <span>Veg</span>
            </button>
            <button
              type="button"
              onClick={() => setVegFilter("non-veg")}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                vegFilter === "non-veg"
                  ? "bg-red-700 text-white font-semibold"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              <Beef className="h-3 w-3" />
              <span>Non-Veg</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMenu(true)}
            className="h-8.5 px-2.5 text-xs"
            leftIcon={<RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Menu Items Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--text-secondary)]">
            No menu items match your current filter.
          </div>
        ) : (
          <div className="w-full overflow-x-auto no-scrollbar sm:scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[var(--text-secondary)] font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Prep Time</th>
                  <th className="py-3 px-4">Modifiers</th>
                  <th className="py-3 px-4 text-center">In Stock?</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    className={`hover:bg-[var(--bg-subtle)]/80 focus-within:bg-[var(--bg-subtle)]/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)] transition-colors ${
                      !item.isAvailable ? "opacity-60 bg-[var(--bg-subtle)]/20" : ""
                    }`}
                  >
                    {/* Item Name & Veg status */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {item.imageUrl && (
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              width={32}
                              height={32}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                              }}
                            />
                          </div>
                        )}
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                            item.isVeg
                              ? "border-emerald-600 bg-white"
                              : "border-red-700 bg-white"
                          }`}
                        >
                          <div
                            className={`h-2 w-2 rounded-full ${
                              item.isVeg ? "bg-emerald-600" : "bg-red-700"
                            }`}
                          />
                        </div>

                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">
                            {item.name}
                          </div>
                          {item.description && (
                            <div className="text-[11px] text-[var(--text-secondary)] max-w-sm truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 text-[var(--text-secondary)] font-medium">
                      {item.categoryName}
                    </td>

                    {/* Price */}
                    <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)]">
                      {formatPaiseToINR(item.pricePaise)}
                    </td>

                    {/* Prep Time */}
                    <td className="py-3 px-4 text-[var(--text-secondary)] font-mono text-[11px]">
                      {item.prepTimeMinutes} mins
                    </td>

                    {/* Modifiers button */}
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setManagingModifiersItem(item)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
                      >
                        <Sliders className="h-3 w-3 text-[var(--primary)]" />
                        <span>Modifiers ({item.modifiers.length})</span>
                      </button>
                    </td>

                    {/* Availability Switch */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(item)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                          item.isAvailable
                            ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                            : "bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800"
                        }`}
                        title="Click to toggle availability"
                      >
                        <div
                          className={`h-2 w-2 rounded-full ${
                            item.isAvailable ? "bg-emerald-600" : "bg-red-600"
                          }`}
                        />
                        <span>{item.isAvailable ? "Available" : "Sold Out"}</span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => openItemModal(item)}
                        className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                        title="Edit Item"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item)}
                        className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Delete Item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category Modal (Create / Edit) */}
      {isCategoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6 text-[var(--text-primary)]">
            <h3 className="font-bold text-base mb-1">
              {editingCategory ? `Edit Category: ${editingCategory.name}` : "Create New Category"}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Categories group dishes into sticky tabs in the guest ordering menu.
            </p>

            <form onSubmit={handleSaveCategory} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={categoryName}
                  onChange={(e) => {
                    setCategoryName(e.target.value);
                    if (!editingCategory) {
                      setCategorySlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-+|-+$/g, "")
                      );
                    }
                  }}
                  placeholder="e.g. Signature Curries"
                  className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  URL Slug
                </label>
                <input
                  type="text"
                  required
                  value={categorySlug}
                  onChange={(e) => setCategorySlug(e.target.value)}
                  placeholder="signature-curries"
                  className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={categorySortOrder}
                  onChange={(e) => setCategorySortOrder(Number(e.target.value))}
                  className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCategoryModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSavingCategory}
                >
                  Save Category
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu Item Modal (Create / Edit) */}
      {isItemModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6 text-[var(--text-primary)] max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base mb-1">
              {editingItem ? `Edit Menu Item: ${editingItem.name}` : "Add Menu Item"}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Item details, dietary tags, kitchen prep duration, and image.
            </p>

            <form onSubmit={handleSaveItem} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Dish Name
                  </label>
                  <input
                    type="text"
                    required
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Murgh Malai Tikka"
                    className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Category
                  </label>
                  <select
                    required
                    value={itemCategoryId}
                    onChange={(e) => setItemCategoryId(e.target.value)}
                    className="w-full h-9 px-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Price in Rupees (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={itemPriceRupees}
                    onChange={(e) => setItemPriceRupees(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Prep Time (Minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={itemPrepMinutes}
                    onChange={(e) => setItemPrepMinutes(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Dietary Flag
                  </label>
                  <div className="flex h-9 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setItemIsVeg(true)}
                      className={`flex-1 rounded-md text-xs font-semibold cursor-pointer ${
                        itemIsVeg ? "bg-emerald-600 text-white" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemIsVeg(false)}
                      className={`flex-1 rounded-md text-xs font-semibold cursor-pointer ${
                        !itemIsVeg ? "bg-red-700 text-white" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      Non-Veg
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Description / Culinary Notes
                </label>
                <textarea
                  rows={2}
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Ingredients, marinade nuances, serving suggestions..."
                  className="w-full p-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Item Photo (Upload or URL)
                </label>
                <div className="flex items-center gap-2">
                  {itemImageUrl && (
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                      <Image
                        src={itemImageUrl}
                        alt="Preview"
                        width={36}
                        height={36}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <input
                    type="text"
                    value={itemImageUrl}
                    onChange={(e) => setItemImageUrl(e.target.value)}
                    placeholder="https://... or /uploads/..."
                    className="flex-1 h-9 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  />

                  <label className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{isUploadingImage ? "Uploading..." : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isUploadingImage}
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsItemModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSavingItem}
                >
                  Save Item
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modifiers Manager Sheet */}
      <Sheet
        isOpen={Boolean(managingModifiersItem)}
        onClose={() => setManagingModifiersItem(null)}
        side="right"
        title={managingModifiersItem ? `Modifiers: ${managingModifiersItem.name}` : "Modifiers"}
        description="Add customization groups such as Spice Level, Dip Choice, or Portions."
      >
        {managingModifiersItem && (
          <div className="space-y-6 text-xs">
            {/* List Existing Modifiers */}
            <div>
              <h5 className="font-semibold text-[var(--text-primary)] uppercase text-[10px] tracking-wider font-mono mb-2">
                Current Modifiers ({managingModifiersItem.modifiers.length})
              </h5>

              {managingModifiersItem.modifiers.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic p-3 rounded-lg bg-[var(--bg-subtle)]">
                  No custom modifiers added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {managingModifiersItem.modifiers.map((mod) => (
                    <div
                      key={mod.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
                    >
                      <div>
                        <div className="font-semibold text-[var(--text-primary)]">
                          {mod.name}{" "}
                          <span className="text-[10px] text-[var(--text-muted)] font-normal font-mono">
                            [{mod.groupName}]
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                          {mod.pricePaise > 0
                            ? `+${formatPaiseToINR(mod.pricePaise)}`
                            : "Free"}
                          {mod.isRequired && " · Required choice"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteModifier(mod.id)}
                        className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                        title="Remove modifier"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Modifier Form */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <h5 className="font-semibold text-[var(--text-primary)] uppercase text-[10px] tracking-wider font-mono mb-3">
                Add Modifier Option
              </h5>

              <form onSubmit={handleAddModifier} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Group Name
                  </label>
                  <input
                    type="text"
                    required
                    value={modGroupName}
                    onChange={(e) => setModGroupName(e.target.value)}
                    placeholder="e.g. Spice Level, Dip Choice, Portion"
                    className="w-full h-8.5 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Option Name
                  </label>
                  <input
                    type="text"
                    required
                    value={modName}
                    onChange={(e) => setModName(e.target.value)}
                    placeholder="e.g. Extra Spicy, Garlic Yoghurt Dip"
                    className="w-full h-8.5 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Price in ₹ (+Extra)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={modPriceRupees}
                      onChange={(e) => setModPriceRupees(Number(e.target.value))}
                      className="w-full h-8.5 px-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--primary)]"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-primary)] select-none">
                      <input
                        type="checkbox"
                        checked={modIsRequired}
                        onChange={(e) => setModIsRequired(e.target.checked)}
                        className="rounded border-[var(--border-subtle)] text-[var(--primary)] focus:ring-[var(--primary)]"
                      />
                      <span>Is Required?</span>
                    </label>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isAddingModifier}
                  className="w-full mt-2 text-xs"
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                >
                  Add Option to {managingModifiersItem.name}
                </Button>
              </form>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
