import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

interface ShareData {
  title: string | null;
  text: string | null;
  url: string | null;
}

const ShareTargetPage = () => {
  const location = useLocation();
  const [shareData, setShareData] = useState<ShareData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const data: ShareData = {
      title: params.get('title'),
      text: params.get('text'),
      url: params.get('url'),
    };
    setShareData(data);
  }, [location]);

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Shared Content</h1>
      {shareData ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {shareData.title && <h2 className="text-xl font-semibold mb-2">{shareData.title}</h2>}
          {shareData.text && <p className="text-gray-700 dark:text-gray-300 mb-4">{shareData.text}</p>}
          {shareData.url && (
            <a
              href={shareData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-govBlue hover:underline"
            >
              {shareData.url}
            </a>
          )}
        </div>
      ) : (
        <p>No content shared.</p>
      )}
    </div>
  );
};

export default ShareTargetPage;