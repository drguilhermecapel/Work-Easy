import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Bell, Briefcase, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Avatar from './Avatar';
import { UserType } from '../types';
import { isNavActive, navModelFor } from './navItems';

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const auth = useAuth();
  const { user, switchRole } = auth;
  const demo = auth.mode === 'demo';
  const nav = navModelFor(auth);
  // With a backend the menu can hold up to seven links, so it needs the wider breakpoint
  const accountName = demo ? user.name : auth.profile?.full_name || 'Minha conta';

  const isActive = (path: string) => (isNavActive(location.pathname, path) ? 'text-primary font-bold' : 'text-gray-600');

  return (
    <nav className="bg-white shadow-xs sticky top-[env(safe-area-inset-top)] z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="shrink-0 flex items-center">
              <span className="text-2xl font-bold text-primary">WorkEasy</span>
            </Link>
            
            {/* Role Switcher for Demo - Hidden on Mobile to avoid clutter, visible on Desktop */}
            {demo && <div className="hidden lg:flex ml-8 bg-gray-100 rounded-full p-1 items-center">
               <button 
                 onClick={() => switchRole(UserType.CLIENT)}
                 className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${user.type === UserType.CLIENT ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
               >
                 Cliente
               </button>
               <button 
                 onClick={() => switchRole(UserType.PROVIDER, false)}
                 className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${user.type === UserType.PROVIDER && !user.isHealthProfessional ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
               >
                 Prestador
               </button>
               <button 
                 onClick={() => switchRole(UserType.PROVIDER, true)}
                 className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${user.isHealthProfessional ? 'bg-teal-500 shadow-sm text-white' : 'text-gray-500'}`}
               >
                 Médico
               </button>
            </div>}
          </div>
          
          {/* Desktop Menu */}
          <div className={`hidden ${demo ? 'md:flex' : 'lg:flex'} items-center space-x-5 xl:space-x-7 text-sm`}>
            <Link to="/" className={`${isActive('/')} hover:text-primary transition-colors`}>Início</Link>

            {nav.items.map(item => (
              <Link key={item.to} to={item.to} className={`${isActive(item.to)} hover:text-primary transition-colors`}>
                {item.label}
              </Link>
            ))}
            {nav.cta && (
              <Link
                to={nav.cta.to}
                className="flex items-center gap-1 text-sm font-medium bg-purple-50 text-primary px-3 py-1.5 rounded-full hover:bg-purple-100 transition-colors"
              >
                <Briefcase size={16} /> {nav.cta.label}
              </Link>
            )}
            {demo && user.type === UserType.PROVIDER && user.isHealthProfessional && (
              <span className="bg-teal-100 text-teal-800 text-xs px-2 py-1 rounded-sm border border-teal-200">
                CRM informado (não verificado)
              </span>
            )}

            <div className="flex items-center space-x-4 ml-2">
              {demo && (
                <button className="text-gray-500 hover:text-primary relative" aria-label="Notificações">
                  <Bell size={20} />
                  <span className="absolute top-0 right-0 block h-2 w-2 rounded-full ring-2 ring-white bg-red-500 transform translate-x-1/2 -translate-y-1/2"></span>
                </button>
              )}
              {!demo && !auth.session ? (
                <Link to="/entrar" className="flex items-center gap-1 font-medium text-primary hover:underline">
                  <LogIn size={16} /> Entrar
                </Link>
              ) : (
                <Link
                  to={demo ? '/profile/me' : '/conta'}
                  className="flex items-center space-x-2 text-gray-700 hover:text-primary"
                  aria-label={`Perfil de ${accountName}`}
                >
                  <Avatar name={accountName} className="w-8 h-8 text-xs border border-gray-200" />
                </Link>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className={`flex items-center ${demo ? 'md:hidden' : 'lg:hidden'}`}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={isOpen}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-hidden"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className={`${demo ? 'md:hidden' : 'lg:hidden'} bg-white border-t border-gray-100`}>
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {demo && (
              <div className="flex gap-2 p-2 bg-gray-50 rounded-lg mb-2">
                <button onClick={() => switchRole(UserType.CLIENT)} className={`flex-1 py-1 text-xs rounded-sm ${user.type === UserType.CLIENT ? 'bg-white shadow-sm' : ''}`}>Cliente</button>
                <button onClick={() => switchRole(UserType.PROVIDER, false)} className={`flex-1 py-1 text-xs rounded-sm ${user.type === UserType.PROVIDER && !user.isHealthProfessional ? 'bg-white shadow-sm' : ''}`}>Prestador</button>
                <button onClick={() => switchRole(UserType.PROVIDER, true)} className={`flex-1 py-1 text-xs rounded-sm ${user.isHealthProfessional ? 'bg-teal-500 text-white shadow-sm' : ''}`}>Médico</button>
              </div>
            )}

            {[{ label: 'Início', to: '/' }, ...nav.items, ...(nav.cta ? [nav.cta] : [])].map(item => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium hover:text-primary hover:bg-gray-50 ${
                  isNavActive(location.pathname, item.to) ? 'text-primary' : 'text-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}

            {!demo && !auth.session ? (
              <Link
                to="/entrar"
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-primary hover:bg-gray-50"
              >
                Entrar
              </Link>
            ) : (
              <Link
                to={demo ? '/profile/me' : '/conta'}
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50"
              >
                {demo ? 'Meu Perfil' : 'Minha conta'}
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;