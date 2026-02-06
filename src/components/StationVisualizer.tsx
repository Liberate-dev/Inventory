import { useLanguage } from '../context/LanguageContext';

export interface StationVisualizerProps {
    stationName: string;
    stationComponents: Record<string, any>;
    selectedComponent: string | null;
    hoveredComponent: string | null;
    onSelectComponent: (type: string | null) => void;
    onHoverComponent: (type: string | null) => void;
}

const StationVisualizer = ({
    stationName,
    stationComponents,
    selectedComponent, // Now used in logic below if necessary, strictly for visual feedback if we want highlighting based on selection too?
    hoveredComponent,
    onSelectComponent,
    onHoverComponent
}: StationVisualizerProps) => { // Removed ComponentType to avoid circular dep issues, using string for now or re-export type.
    const { t } = useLanguage();

    return (
        <div className="flex-[2] bg-slate-950 relative overflow-hidden flex items-center justify-center">

            {/* Background Grid */}
            <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}
            />

            {/* Title Overlay */}
            <div className="absolute top-6 left-6 z-20 pointer-events-none">
                <h3 className="text-indigo-400 text-xs font-mono uppercase tracking-[0.2em] mb-1">{t('station_overview')}</h3>
                <h2 className="text-white text-3xl font-bold font-mono tracking-tight">{stationName}</h2>
                <p className="text-slate-500 text-xs mt-2 font-mono">
                    {t('station_interact_hint')}
                </p>
            </div>

            {/* Static Image Layer */}
            <div className="relative w-[800px] max-w-full aspect-[4/3] flex items-center justify-center p-8">
                <div className="w-full h-full p-4 flex items-center justify-center">
                    <svg
                        width="100%"
                        height="100%"
                        viewBox="0 0 800 600"
                        preserveAspectRatio="xMidYMid meet"
                        xmlns="http://www.w3.org/2000/svg"
                        className="max-h-full"
                    >
                        <defs>
                            <linearGradient id="screenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="white" />
                                <stop offset="100%" stopColor="transparent" />
                            </linearGradient>
                            <radialGradient id="fanGrad">
                                <stop offset="0%" stopColor="#4f46e5" />
                                <stop offset="0.8" stopColor="#4f46e5" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="transparent" />
                            </radialGradient>
                        </defs>

                        {/* Desk Group (Background) */}
                        {stationComponents['desk'] && (
                            <g
                                id="desk"
                                className="cursor-pointer transition-opacity duration-300"
                                onMouseEnter={() => onHoverComponent('desk')}
                                onMouseLeave={() => onHoverComponent(null)}
                                onClick={() => onSelectComponent('desk')}
                            >
                                {/* Desk Surface Highlight */}
                                {(hoveredComponent === 'desk' || selectedComponent === 'desk') && (
                                    <rect
                                        x="0" y="0" width="800" height="600" rx="20"
                                        fill="rgba(99, 102, 241, 0.05)" stroke="#6366f1" strokeWidth={selectedComponent === 'desk' ? "6" : "4"}
                                        className={selectedComponent === 'desk' ? "" : "animate-pulse"}
                                    />
                                )}

                                {/* Visual Label for Desk */}
                                {(hoveredComponent === 'desk' || selectedComponent === 'desk') && (
                                    <foreignObject x="650" y="520" width="120" height="40">
                                        <div className={`text-white text-xs px-3 py-1.5 rounded border font-medium text-center shadow-lg ${selectedComponent === 'desk' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-600'}`}>
                                            {t('physical_desk')}
                                        </div>
                                    </foreignObject>
                                )}
                            </g>
                        )}

                        {/* Monitor Group */}
                        {stationComponents['monitor'] && (
                            <g
                                id="monitor"
                                transform="translate(80, 80)"
                                className="cursor-pointer transition-opacity duration-300"
                                onMouseEnter={() => onHoverComponent('monitor')}
                                onMouseLeave={() => onHoverComponent(null)}
                                onClick={() => onSelectComponent('monitor')}
                            >
                                {/* Highlight */}
                                {(hoveredComponent === 'monitor' || selectedComponent === 'monitor') && (
                                    <rect
                                        x="-10" y="-10" width="300" height="248" rx="12"
                                        fill="rgba(99, 102, 241, 0.2)" stroke="#6366f1" strokeWidth={selectedComponent === 'monitor' ? "4" : "3"}
                                        className={selectedComponent === 'monitor' ? "shadow-glow" : "animate-pulse"}
                                    />
                                )}
                                {/* Visuals */}
                                <rect x="0" y="0" width="280" height="180" rx="5" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                                <rect x="10" y="10" width="260" height="160" fill="#0f172a" />
                                <rect x="120" y="180" width="40" height="40" fill="#1e293b" />
                                <rect x="90" y="220" width="100" height="8" rx="2" fill="#1e293b" />
                                <path d="M10 10 L260 10 L10 160 Z" fill="url(#screenGrad)" opacity="0.1" />
                                {/* Label */}
                                {(hoveredComponent === 'monitor' || selectedComponent === 'monitor') && (
                                    <foreignObject x="90" y="-50" width="100" height="40">
                                        <div className={`text-white text-xs px-3 py-1.5 rounded border font-medium text-center shadow-lg ${selectedComponent === 'monitor' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-600'}`}>
                                            {t('monitor')}
                                        </div>
                                    </foreignObject>
                                )}
                            </g>
                        )}

                        {/* PC Tower Group */}
                        {stationComponents['pc'] && (
                            <g
                                id="pc"
                                transform="translate(480, 60)"
                                className="cursor-pointer"
                                onMouseEnter={() => onHoverComponent('pc')}
                                onMouseLeave={() => onHoverComponent(null)}
                                onClick={() => onSelectComponent('pc')}
                            >
                                {(hoveredComponent === 'pc' || selectedComponent === 'pc') && (
                                    <rect
                                        x="-10" y="-10" width="140" height="280" rx="12"
                                        fill="rgba(99, 102, 241, 0.2)" stroke="#6366f1" strokeWidth={selectedComponent === 'pc' ? "4" : "3"}
                                        className={selectedComponent === 'pc' ? "" : "animate-pulse"}
                                    />
                                )}
                                <rect x="0" y="0" width="120" height="260" rx="4" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                                <rect x="12" y="18" width="96" height="224" fill="#0f172a" opacity="0.8" />
                                <circle cx="60" cy="65" r="30" fill="url(#fanGrad)" opacity="0.7" />
                                <circle cx="60" cy="145" r="30" fill="url(#fanGrad)" opacity="0.7" />
                                <circle cx="60" cy="225" r="30" fill="url(#fanGrad)" opacity="0.7" />
                                {(hoveredComponent === 'pc' || selectedComponent === 'pc') && (
                                    <foreignObject x="10" y="-50" width="100" height="40">
                                        <div className={`text-white text-xs px-3 py-1.5 rounded border font-medium text-center shadow-lg ${selectedComponent === 'pc' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-600'}`}>
                                            {t('pc_tower')}
                                        </div>
                                    </foreignObject>
                                )}
                            </g>
                        )}

                        {/* Keyboard Group */}
                        {stationComponents['keyboard'] && (
                            <g
                                id="keyboard"
                                transform="translate(60, 380)"
                                className="cursor-pointer"
                                onMouseEnter={() => onHoverComponent('keyboard')}
                                onMouseLeave={() => onHoverComponent(null)}
                                onClick={() => onSelectComponent('keyboard')}
                            >
                                {(hoveredComponent === 'keyboard' || selectedComponent === 'keyboard') && (
                                    <rect
                                        x="-10" y="-10" width="320" height="110" rx="12"
                                        fill="rgba(99, 102, 241, 0.2)" stroke="#6366f1" strokeWidth={selectedComponent === 'keyboard' ? "4" : "3"}
                                        className={selectedComponent === 'keyboard' ? "" : "animate-pulse"}
                                    />
                                )}
                                <rect x="0" y="0" width="300" height="90" rx="4" fill="#334155" />
                                <rect x="8" y="8" width="284" height="74" rx="2" fill="#1e293b" />
                                <rect x="16" y="16" width="268" height="12" fill="#475569" opacity="0.5" />
                                <rect x="16" y="34" width="268" height="12" fill="#475569" opacity="0.5" />
                                <rect x="16" y="52" width="200" height="12" fill="#475569" opacity="0.5" />
                                {(hoveredComponent === 'keyboard' || selectedComponent === 'keyboard') && (
                                    <foreignObject x="100" y="-50" width="100" height="40">
                                        <div className={`text-white text-xs px-3 py-1.5 rounded border font-medium text-center shadow-lg ${selectedComponent === 'keyboard' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-600'}`}>
                                            {t('keyboard')}
                                        </div>
                                    </foreignObject>
                                )}
                            </g>
                        )}

                        {/* Mouse Group */}
                        {stationComponents['mouse'] && (
                            <g
                                id="mouse"
                                transform="translate(520, 400)"
                                className="cursor-pointer"
                                onMouseEnter={() => onHoverComponent('mouse')}
                                onMouseLeave={() => onHoverComponent(null)}
                                onClick={() => onSelectComponent('mouse')}
                            >
                                {(hoveredComponent === 'mouse' || selectedComponent === 'mouse') && (
                                    <rect
                                        x="-10" y="-10" width="75" height="100" rx="35"
                                        fill="rgba(99, 102, 241, 0.2)" stroke="#6366f1" strokeWidth={selectedComponent === 'mouse' ? "4" : "3"}
                                        className={selectedComponent === 'mouse' ? "" : "animate-pulse"}
                                    />
                                )}
                                <rect x="0" y="0" width="55" height="80" rx="28" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                                <path d="M0 25 L55 25" stroke="#334155" strokeWidth="2" />
                                <path d="M27.5 0 L27.5 25" stroke="#334155" strokeWidth="2" />
                                <rect x="24" y="5" width="7" height="12" rx="3" fill="#6366f1" />
                                {(hoveredComponent === 'mouse' || selectedComponent === 'mouse') && (
                                    <foreignObject x="-22.5" y="-50" width="100" height="40">
                                        <div className={`text-white text-xs px-3 py-1.5 rounded border font-medium text-center shadow-lg ${selectedComponent === 'mouse' ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-600'}`}>
                                            {t('mouse')}
                                        </div>
                                    </foreignObject>
                                )}
                            </g>
                        )}
                    </svg>
                </div>
            </div>

        </div>
    );
};

export default StationVisualizer;
