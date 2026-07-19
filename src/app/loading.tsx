export default function Loading() {
  return <main className="loading-page" id="main-content" aria-busy="true" aria-label="Loading directory"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-toolbar" />{Array.from({ length: 8 }, (_, index) => <div className="skeleton skeleton-row" key={index} />)}</main>;
}
