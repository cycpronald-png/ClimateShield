import { Link } from "react-router-dom";

export function DonationHeader() {
    return (
        <header className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-800 bg-[#111827]/80 backdrop-blur-md px-4 sm:px-10 py-3 shadow-sm">
            <div className="flex items-center gap-8">
                <Link to="/" className="flex items-center gap-3 group">
                    <img
                        src={`${import.meta.env.BASE_URL}logo.png`}
                        alt="ClimateShield logo"
                        className="size-12 object-contain mix-blend-multiply dark:mix-blend-screen"
                    />
                    <span className="text-white text-xl font-bold leading-tight tracking-tight">ClimateShield</span>
                </Link>
                <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
                    <Link to="/" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm font-medium">Dashboard</Link>
                    <Link to="/donate" className="text-cyan-400 font-semibold text-sm leading-normal" aria-current="page">Donate</Link>
                    <Link to="#" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm font-medium">Stories</Link>
                </nav>
            </div>
            <div className="flex items-center justify-end gap-4">
                <div className="size-10 rounded-full bg-gray-700 ring-2 ring-gray-700 hover:ring-cyan-500 transition-all overflow-hidden">
                    <img
                        src="https://ui-avatars.com/api/?name=Guest+User&background=0D9488&color=fff"
                        alt="Guest User avatar"
                    />
                </div>
            </div>
        </header>
    );
}
