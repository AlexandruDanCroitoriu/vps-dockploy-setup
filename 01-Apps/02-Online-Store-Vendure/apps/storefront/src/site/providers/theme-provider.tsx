"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";

export type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
    theme: Theme;
    resolvedTheme: "light" | "dark";
    setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): "light" | "dark" {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({children}: {children: React.ReactNode}) {
    const [theme, setThemeState] = useState<Theme>("system");
    const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

    const applyTheme = useCallback((nextTheme: Theme) => {
        const resolved = nextTheme === "system" ? getSystemTheme() : nextTheme;
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(resolved);
        root.style.colorScheme = resolved;
        setResolvedTheme(resolved);
    }, []);

    const setTheme = useCallback((nextTheme: Theme) => {
        localStorage.setItem("theme", nextTheme);
        setThemeState(nextTheme);
        applyTheme(nextTheme);
    }, [applyTheme]);

    useEffect(() => {
        const storedTheme = localStorage.getItem("theme");
        const initialTheme: Theme = storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
            ? storedTheme
            : "system";
        setThemeState(initialTheme);
        applyTheme(initialTheme);

        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handleSystemChange = () => {
            if ((localStorage.getItem("theme") || "system") === "system") {
                applyTheme("system");
            }
        };
        media.addEventListener("change", handleSystemChange);
        return () => media.removeEventListener("change", handleSystemChange);
    }, [applyTheme]);

    const value = useMemo(() => ({theme, resolvedTheme, setTheme}), [theme, resolvedTheme, setTheme]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error("useTheme must be used inside ThemeProvider");
    return context;
}
