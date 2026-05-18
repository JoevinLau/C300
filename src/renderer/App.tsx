import { useEffect } from "react";

function App() {
	const { electron, node, chrome } = window.electronAPI.versions;

	return (
		<main className="app-shell">
			<section className="hero-card">
				<p className="eyebrow">Electron + React + TypeScript</p>
				<h1>Desktop app structure is ready.</h1>
				<p className="description">
					The project is split into dedicated main, preload, and renderer layers
					so you can add native capabilities without mixing them into the UI.
				</p>

				<div className="meta-grid">
					<article className="meta-card">
						<span className="label">Platform</span>
						<strong>{window.electronAPI.platform}</strong>
					</article>
					<article className="meta-card">
						<span className="label">Electron</span>
						<strong>{electron}</strong>
					</article>
					<article className="meta-card">
						<span className="label">Node</span>
						<strong>{node}</strong>
					</article>
					<article className="meta-card">
						<span className="label">Chrome</span>
						<strong>{chrome}</strong>
					</article>
				</div>

				<p className="status">
					Preload bridge check: <code>{window.electronAPI.ping()}</code>
				</p>
			</section>
		</main>
	);
}

export default App;
