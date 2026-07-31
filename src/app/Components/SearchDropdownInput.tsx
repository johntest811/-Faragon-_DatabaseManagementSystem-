"use client";

import { useId, useState } from "react";

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
  const listboxId = useId();
  const query = value.trim().toLowerCase();
  const filteredOptions = options
    .filter((option) => !query || option.toLowerCase().includes(query))
    .slice(0, 60);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
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
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 overflow-y-auto rounded-xl border-2 border-slate-200 bg-white p-1 shadow-2xl"
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
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-black hover:bg-[#fff3b0]"
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-gray-500">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
