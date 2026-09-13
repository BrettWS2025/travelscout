"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useOperatorHref } from "@/hooks/useOperatorSurface";

type Props = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

/** Link that uses /operator paths on the main site and clean paths on the operator subdomain. */
export function OperatorLink({ href, ...rest }: Props) {
  const resolved = useOperatorHref(href);
  return <Link href={resolved} {...rest} />;
}
