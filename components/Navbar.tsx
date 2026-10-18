import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Bell, User as UserIcon, Briefcase, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserType } from '../types';

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user, switchRole } = useAuth();

  const isActive = (path: string) => location.pathname === path ? 'text-primary font-bold' : 'text-gray-600';

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <span className="text-2xl font-bold text-primary">WorkEasy</span>
            </Link>
            
            {/* Role Switcher for Demo - Hidden on Mobile to avoid clutter, visible on Desktop */}
            <div className="hidden lg:flex ml-8 bg-gray-100 rounded-full p-1 items-center">
               <button 
                 onClick={() => switchRole(UserType.CLIENT)}
                 className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${user.type === UserType.CLIENT ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
               >
                 Cliente
               </button>
               <button 
                 onClick={() => switchRole(UserType.PROVIDER, false)}
                 className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${user.type === UserType.PROVIDER && !user.isHealthProfessional ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
               >
                 Prestador
               </button>
               <button 
                 onClick={() => switchRole(UserType.PROVIDER, true)}
                 className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${user.isHealthProfessional ? 'bg-teal-500 shadow text-white' : 'text-gray-500'}`}
               >
                 Médico
               </button>
            </div>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <Link to="/" className={`${isActive('/')} hover:text-primary transition-colors`}>Início</Link>
            
            {user.type === UserType.CLIENT ? (
              <>
                <Link to="/search" className={`${isActive('/search')} hover:text-primary transition-colors`}>Buscar</Link>
                <Link to="/dashboard" className={`${isActive('/dashboard')} hover:text-primary transition-colors`}>Meus Pedidos</Link>
                <Link 
                  to="/register-provider" 
                  className="flex items-center gap-1 text-sm font-medium bg-purple-50 text-primary px-3 py-1.5 rounded-full hover:bg-purple-100 transition-colors"
                >
                  <Briefcase size={16} /> Sou Profissional
                </Link>
              </>
            ) : (
              <>
                <Link to="/dashboard" className={`${isActive('/dashboard')} hover:text-primary transition-colors`}>Meu Painel</Link>
                {user.isHealthProfessional && (
                   <span className="bg-teal-100 text-teal-800 text-xs px-2 py-1 rounded border border-teal-200">
                     CRM Ativo
                   </span>
                )}
              </>
            )}

            <div className="flex items-center space-x-4 ml-4">
              <button className="text-gray-500 hover:text-primary relative">
                <Bell size={20} />
                <span className="absolute top-0 right-0 block h-2 w-2 rounded-full ring-2 ring-white bg-red-500 transform translate-x-1/2 -translate-y-1/2"></span>
              </button>
              <Link to="/profile/me" className="flex items-center space-x-2 text-gray-700 hover:text-primary">
                <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border border-gray-200">
                   <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                </div>
              </Link>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-gray-100">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
             {/* Mobile Role Switcher */}
             <div className="flex gap-2 p-2 bg-gray-50 rounded-lg mb-2">
               <button onClick={() => switchRole(UserType.CLIENT)} className={`flex-1 py-1 text-xs rounded ${user.type === UserType.CLIENT ? 'bg-white shadow' : ''}`}>Cliente</button>
               <button onClick={() => switchRole(UserType.PROVIDER, false)} className={`flex-1 py-1 text-xs rounded ${user.type === UserType.PROVIDER && !user.isHealthProfessional ? 'bg-white shadow' : ''}`}>Prestador</button>
               <button onClick={() => switchRole(UserType.PROVIDER, true)} className={`flex-1 py-1 text-xs rounded ${user.isHealthProfessional ? 'bg-teal-500 text-white shadow' : ''}`}>Médico</button>
             </div>

            <Link 
              to="/" 
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50"
            >
              Início
            </Link>
            
            {user.type === UserType.CLIENT ? (
              <>
                <Link 
                  to="/search" 
                  onClick={() => setIsOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50"
                >
                  Buscar Profissionais
                </Link>
                <Link 
                  to="/dashboard" 
                  onClick={() => setIsOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50"
                >
                  Minhas Solicitações
                </Link>
              </>
            ) : (
              <Link 
                to="/dashboard" 
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50"
              >
                Painel do Prestador
              </Link>
            )}

             <Link 
              to="/profile/me" 
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary hover:bg-gray-50"
            >
              Meu Perfil
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;