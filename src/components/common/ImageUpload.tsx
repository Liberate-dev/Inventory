import React, { useState, useRef } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';

interface ImageUploadProps {
    value?: string;
    onChange: (url: string) => void;
    label?: string;
    description?: string;
    className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ value, onChange, label, description, className = '' }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(value || null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');
    const UPLOAD_ENDPOINT = `${API_BASE_URL}/inventory/upload.php`;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Create local preview
        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);
        setIsUploading(true);

        const formData = new FormData();
        formData.append('image', file);

        try {
            const token = localStorage.getItem('auth_token');
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(UPLOAD_ENDPOINT, {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const data = await response.json();

            if (data.status === 'success' && data.url) {
                onChange(data.url); // We store the internal path
            } else {
                alert(data.message || 'Gagal mengunggah gambar');
                setPreview(value || null);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Terjadi kesalahan saat mengunggah gambar');
            setPreview(value || null);
        } finally {
            setIsUploading(false);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        setPreview(null);
        onChange('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const getFullImageUrl = (path: string) => {
        if (!path) return '';
        if (path.startsWith('http') || path.startsWith('blob:')) return path;
        // Construct the full URL for display
        return `${window.location.protocol}//${window.location.host}/${path}`;
    };

    return (
        <div className={`space-y-2 ${className}`}>
            {label && <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</label>}
            
            <div 
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden min-h-[120px] 
                    ${preview ? 'border-indigo-200 bg-indigo-50/10' : 'border-gray-200 hover:border-indigo-400 bg-gray-50/50 hover:bg-gray-50'}
                `}
            >
                {preview ? (
                    <>
                        <img 
                            src={getFullImageUrl(preview)} 
                            alt="Preview" 
                            className="w-full h-full object-cover max-h-[200px]"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full flex items-center gap-2">
                                <Upload size={14} /> Ganti Gambar
                            </span>
                        </div>
                        <button 
                            onClick={handleRemove}
                            className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 text-gray-400 hover:text-red-500 rounded-full shadow-sm transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </>
                ) : (
                    <div className="p-6 text-center">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-gray-400">
                            {isUploading ? <Loader2 size={24} className="animate-spin text-indigo-500" /> : <ImageIcon size={24} />}
                        </div>
                        <p className="text-sm font-semibold text-gray-600">{isUploading ? 'Mengunggah...' : 'Klik untuk Unggah'}</p>
                        {description && <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tight font-bold">{description}</p>}
                    </div>
                )}
                
                <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={isUploading}
                />
            </div>
        </div>
    );
};
