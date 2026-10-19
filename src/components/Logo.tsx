import type { SVGProps } from 'react';

/** PoultryPro brand mark: a hen silhouette with an egg. Inherits colour via currentColor. */
export default function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="PoultryPro" role="img" {...props}>
      {/* comb */}
      <circle cx="21" cy="6.5" r="1.8" fill="currentColor" />
      <circle cx="24" cy="7.5" r="1.8" fill="currentColor" />
      {/* head + body + tail */}
      <path
        fill="currentColor"
        d="M22.5 8a4 4 0 0 0-4 4c0 1.2.5 2.3 1.3 3.1C14.4 15.6 9 19 8 25H5.5c-.8 0-1.2-.9-.7-1.5C6 21.700 6 19 5.200 16.500c-.3-.9.700-1.600 1.400-1 1.200 1 2.500 1.400 3.800 1.300C12 12.500 15.500 10 19 10.200A4 4 0 0 1 22.500 8z"
      />
      <path fill="currentColor" d="M9 25c.8-4.300 5-7.500 10-7.500 3.700 0 6.500 2.200 6.500 5.500 0 2.800-2.200 4.500-5 4.500H9z" />
      {/* beak */}
      <path d="M26 11l3 1.300L26 13.500z" fill="currentColor" opacity=".75" />
      {/* eye */}
      <circle cx="23.200" cy="11.200" r=".9" fill="#fff" />
      {/* legs */}
      <path d="M15 28v2.500M19 28v2.500" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" />
    </svg>
  );
}
