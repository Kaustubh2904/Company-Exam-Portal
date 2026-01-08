import React from 'react';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="rounded-base shadow-xs m-4">
      <hr className="my-6 border-default sm:mx-auto lg:my-8" />
      <div className="w-full max-w-7xl mx-auto p-4 md:py-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <a
            href="/"
            className="flex items-center mb-4 sm:mb-0 space-x-3 rtl:space-x-reverse"
          >
            <span className="text-heading self-center text-2xl font-semibold whitespace-nowrap science-gothic-fontstyle bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Company Exam Portal
            </span>
          </a>
          <ul className="flex flex-wrap items-center mb-6 text-sm font-medium text-body sm:mb-0">
            <li>
              <a href="#" className="hover:underline me-4 md:me-6">
                About
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline me-4 md:me-6">
                Privacy Policy
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline me-4 md:me-6">
                Licensing
              </a>
            </li>
            <li>
              <a href="#" className="hover:underline">
                Contact
              </a>
            </li>
          </ul>
        </div>
        <hr className="my-6 border-default sm:mx-auto lg:my-8" />
        <span className="block text-sm text-body sm:text-center">
          © {currentYear} {''}
          <a href="/" className="hover:underline">
            Company Exam Portal™
          </a>
          . All Rights Reserved.
        </span>
      </div>
    </footer>
  );
};

export default Footer;
