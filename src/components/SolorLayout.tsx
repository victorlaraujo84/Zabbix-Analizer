import { useRef, useState, type ReactNode } from 'react';
import { BarChart3, Building2, FileText, PanelLeft, Settings, Wrench } from 'lucide-react';

const destinations = [
  { route: '#/app', label: 'Dashboard', icon: BarChart3 },
  { route: '#/clients', label: 'Clientes', icon: Building2 },
  { route: '#/trigger-factory', label: 'Fábrica de Triggers', icon: Wrench },
  { route: '#/reports', label: 'Relatórios', icon: FileText },
  { route: '#/settings', label: 'Configurações', icon: Settings },
];

interface SolorLayoutProps {
  route: string;
  companyName: string;
  logo?: string;
  children: ReactNode;
}

export function SolorLayout({ route, companyName, logo, children }: SolorLayoutProps) {
  const [expanded, setExpanded] = useState(() => !window.matchMedia('(max-width: 900px)').matches);
  const menuButton = useRef<HTMLButtonElement>(null);
  const activeRoute = destinations.find(destination => destination.route === route) ?? destinations[0];

  return (
    <div className="solor-layout" data-expanded={expanded}>
      <aside className="solor-sidebar">
        <div className="solor-sidebar-heading">
          <a className="solor-brand" href="#/app" aria-label={logo ? companyName : "Zabbix Analyzer"}>
            {logo ? <img src={logo} alt={companyName} width={112} height={42} /> : (
              <span className="solor-brand-label">Zabbix Analyzer</span>
            )}
          </a>
          <button
            ref={menuButton}
            type="button"
            className="solor-menu-toggle"
            aria-label={expanded ? 'Recolher navegação' : 'Expandir navegação'}
            aria-controls="solor-navigation"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <PanelLeft size={20} aria-hidden="true" />
          </button>
        </div>
        <nav id="solor-navigation" className="solor-navigation" aria-label="Navegação principal">
          {destinations.map(({ route: destination, label, icon: Icon }) => (
            <a
              key={destination}
              href={destination}
              aria-current={destination === activeRoute.route ? 'page' : undefined}
              aria-label={label}
              title={label}
              onClick={() => {
                if (window.matchMedia('(max-width: 900px)').matches) {
                  setExpanded(false);
                  menuButton.current?.focus();
                }
              }}
            >
              <span className="solor-nav-icon"><Icon size={17} aria-hidden="true" /></span>
              <span className="solor-nav-label">{label}</span>
            </a>
          ))}
        </nav>
      </aside>
      <div className="solor-content">{children}</div>
    </div>
  );
}
