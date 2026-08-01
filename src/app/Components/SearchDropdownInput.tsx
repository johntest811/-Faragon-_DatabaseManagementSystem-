"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SearchDropdownInputProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className: string;
  placeholder?: string;
  required?: boolean;
  emptyLabel?: string;
};

export default function SearchDropdownInput({
  value,
  onChange,
  options,
  className,
  placeholder,
  required,
  emptyLabel = "No matching options found.",
}: SearchDropdownInputProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 224 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const query = value.trim().toLowerCase();
  const filteredOptions = options
    .filter((option) => !query || option.toLowerCase().includes(query))
    .slice(0, 60);

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;

    const rect = inputRef.current.getBoundingClientRect();
    const margin = 10;
    const gap = 6;
    const minimumHeight = 96;
    const availableBelow = window.innerHeight - rect.bottom - gap - margin;
    const maxHeight = Math.min(224, Math.max(minimumHeight, availableBelow));
    const top = Math.max(margin, Math.min(rect.bottom + gap, window.innerHeight - margin - maxHeight));
    const width = Math.min(rect.width, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));

    setPosition({ top, left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updatePosition();
          setOpen(true);
        }}
        onFocus={() => {
          updatePosition();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={listboxId}
              role="listbox"
              className="fixed z-[200] overflow-y-auto rounded-xl border-2 border-slate-200 bg-white p-1 shadow-2xl ring-1 ring-black/5"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={option === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-[#fff3b0] focus:bg-[#fff3b0] focus:outline-none"
                  >
                    {option}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500">{emptyLabel}</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
