"use client";

import { useEffect, useState } from "react";

export function useLiveNow(intervalMs = 60 * 60 * 1000) {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const safeIntervalMs = Math.max(60_000, intervalMs);
		const timer = window.setInterval(() => setNow(new Date()), safeIntervalMs);
		return () => window.clearInterval(timer);
	}, [intervalMs]);

	return now;
}