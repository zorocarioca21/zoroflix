export function getSlug(name) {
    if (!name) return "";
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9]+/g, "-")     // Substitui não-alfanuméricos por hifens
        .replace(/(^-|-$)+/g, "");        // Remove hifens sobressalentes no início e fim
}
